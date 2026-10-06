import { passkey } from "@better-auth/passkey";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  anonymous,
  captcha,
  haveIBeenPwned,
  jwt,
  lastLoginMethod,
  magicLink,
  organization,
} from "better-auth/plugins";
import { twoFactor } from "better-auth/plugins/two-factor";
import { count, eq } from "drizzle-orm";
import { createElement } from "react";
import { db } from "@/db/drizzle";
import * as schema from "@/db/schema";
import {
  ChangeEmailConfirmationEmail,
  changeEmailConfirmationEmailSubject,
} from "@/emails/change-email-confirmation-email";
import { MagicLinkEmail, magicLinkEmailSubject } from "@/emails/magic-link-email";
import {
  NewEmailVerificationEmail,
  newEmailVerificationEmailSubject,
} from "@/emails/new-email-verification-email";
import { OrgInvitationEmail } from "@/emails/org-invitation-email";
import { orgInvitationEmailSubject } from "@/emails/org-invitation-email-subject";
import { PasswordResetEmail, passwordResetEmailSubject } from "@/emails/password-reset-email";
import { VerificationEmail, verificationEmailSubject } from "@/emails/verification-email";
import { env } from "@/env";
import { resolveClientIp } from "@/lib/client-ip";
import { checkSignupLimits, recordSignupRisk } from "@/lib/signup-risk";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { readEmailChangeToken } from "@/lib/email-change-token";
import { deletePersonalStripeCustomers } from "@/lib/account-deletion-billing";
import {
  checkSignupEmail,
  signupEmailDenialCode,
  signupEmailDenialMessage,
} from "@/lib/email-domain-policy";
import {
  isAnonymousUser,
  recordSecurityActivity,
  securityActionForAuthResponse,
} from "@/lib/security-activity";
import { teamMemberAuditHooks } from "@/lib/team-member-audit";
import {
  cancelPersonalSubscription,
  cancelTeamSubscriptionForDeletion,
  recordTeamAuditEvent,
  updateTeamSeatCount,
} from "@/lib/team-billing";

const emailEnabled = isEmailConfigured();
const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
const githubClientId = env.GITHUB_CLIENT_ID?.trim();
const githubClientSecret = env.GITHUB_CLIENT_SECRET?.trim();
const turnstileSecretKey = env.TURNSTILE_SECRET_KEY?.trim();
const turnstileSiteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

const socialProviders = {
  ...(googleClientId && googleClientSecret
    ? {
        google: {
          enabled: true,
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
      }
    : {}),
  ...(githubClientId && githubClientSecret
    ? {
        github: {
          enabled: true,
          clientId: githubClientId,
          clientSecret: githubClientSecret,
        },
      }
    : {}),
};

const captchaPlugin =
  turnstileSecretKey && turnstileSiteKey
    ? captcha({
        provider: "cloudflare-turnstile",
        secretKey: turnstileSecretKey,
        // Include defaults + magic-link request (not /magic-link/verify — email click).
        endpoints: [
          "/sign-up/email",
          "/sign-in/email",
          "/request-password-reset",
          "/sign-in/magic-link",
          // Guest accounts carry a free usage allowance; stop scripted minting.
          "/sign-in/anonymous",
        ],
      })
    : null;

type OrgUpdateAuditMarker = { name: boolean; logo: boolean };

const SIGNUP_RATE_LIMITED_MESSAGE =
  "Too many accounts were created from this network. Please try again later.";

type SignupContext = { request?: Request; headers?: Headers } | null | undefined;

function signupHeaders(ctx: SignupContext) {
  return ctx?.request?.headers ?? ctx?.headers;
}

function resolveSignupIp(ctx: SignupContext) {
  const headers = signupHeaders(ctx);
  return headers ? resolveClientIp(headers) : undefined;
}

function resolveSignupUserAgent(ctx: SignupContext) {
  return signupHeaders(ctx)?.get("user-agent");
}

function assertAllowedSignupEmail(email: string) {
  const result = checkSignupEmail(email);
  if (result.ok) return;
  throw new APIError("BAD_REQUEST", {
    message: signupEmailDenialMessage(result.reason),
    code: signupEmailDenialCode(result.reason),
  });
}

export const auth = betterAuth({
  appName: "Deni AI",
  // Keep the legacy `/token` endpoint unavailable while OAuth 2.1 uses the
  // explicit `/oauth2/token` endpoint below.
  disabledPaths: ["/token"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // Reject disallowed domains before verification / magic-link emails are sent.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path !== "/sign-up/email" &&
        ctx.path !== "/sign-in/magic-link" &&
        ctx.path !== "/change-email"
      ) {
        return;
      }

      const body = ctx.body as { email?: unknown; newEmail?: unknown } | undefined;
      const email =
        typeof body?.email === "string"
          ? body.email
          : typeof body?.newEmail === "string"
            ? body.newEmail
            : null;
      if (!email) return;

      // Magic-link sign-in for an *existing* account keeps working even if
      // the domain is no longer on the allowlist (grandfathered users).
      if (ctx.path === "/sign-in/magic-link") {
        const existing = await ctx.context.internalAdapter.findUserByEmail(email);
        if (existing) return;
      }

      assertAllowedSignupEmail(email);
    }),
    after: createAuthMiddleware(async (ctx) => {
      const action = securityActionForAuthResponse({
        path: ctx.path,
        returned: ctx.context.returned,
        requestUser: ctx.context.session?.user,
        issuedUser: ctx.context.newSession?.user,
      });
      if (!action) return;

      const sessionUser = ctx.context.session?.user ?? ctx.context.newSession?.user ?? null;
      const userId = sessionUser?.id ?? ctx.context.session?.session?.userId;
      if (!userId || sessionUser?.isAnonymous) return;

      const session = ctx.context.session?.session ?? ctx.context.newSession?.session;
      void recordSecurityActivity({
        userId,
        action,
        ipAddress: session?.ipAddress ?? null,
        userAgent: session?.userAgent ?? null,
        metadata: { path: ctx.path },
      }).catch((error) => {
        console.error("Failed to record security activity", error);
      });
    }),
  },
  emailAndPassword: {
    enabled: true,
    // Includes advisory letters+digits addresses; the email policy permits them
    // through this verification and the signup CAPTCHA above.
    requireEmailVerification: emailEnabled,
    sendResetPassword: emailEnabled
      ? async ({ user, url }) => {
          await sendEmail({
            to: user.email,
            subject: passwordResetEmailSubject,
            react: createElement(PasswordResetEmail, {
              name: user.name,
              resetUrl: url,
            }),
          });
        }
      : undefined,
  },
  emailVerification: emailEnabled
    ? {
        sendVerificationEmail: async ({ user, url, token }) => {
          // During an email change Better Auth sends this to the requested address,
          // so the sign-up wording would be wrong there.
          const emailChange = readEmailChangeToken(token);
          await sendEmail(
            emailChange
              ? {
                  to: user.email,
                  subject: newEmailVerificationEmailSubject,
                  react: createElement(NewEmailVerificationEmail, {
                    name: user.name,
                    newEmail: emailChange.newEmail,
                    verificationUrl: url,
                  }),
                }
              : {
                  to: user.email,
                  subject: verificationEmailSubject,
                  react: createElement(VerificationEmail, {
                    name: user.name,
                    verificationUrl: url,
                  }),
                },
          );
        },
        // Called once Better Auth has verified a link. For an email change this is
        // when the address actually switches, so log it here rather than when the
        // change was requested.
        afterEmailVerification: async (user, request) => {
          const token = request ? new URL(request.url).searchParams.get("token") : null;
          const emailChange = readEmailChangeToken(token);
          if (!emailChange || emailChange.requestType === "change-email-confirmation") return;
          try {
            await recordSecurityActivity({
              userId: user.id,
              action: "email_changed",
              ipAddress: request ? (resolveClientIp(request.headers) ?? null) : null,
              userAgent: request?.headers.get("user-agent") ?? null,
              metadata: { path: "/verify-email" },
            });
          } catch (error) {
            console.error("Failed to record security activity", error);
          }
        },
        // Send on sign-up and when an unverified user tries to sign in
        // (better-auth only auto-sends on sign-in when this flag is set).
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
      }
    : undefined,
  plugins: [
    // Expose Deni AI as an OpenID Connect-compatible OAuth 2.1 provider for
    // external applications. The authorization-code flow is intentionally the
    // only interactive grant; refresh tokens require the offline_access scope.
    // The OAuth provider signs its own access and ID tokens. Do not mirror the
    // complete session user into a `set-auth-jwt` response header: profile
    // images can be data URLs, and a large image would exceed Cloudflare's
    // response-header limit and turn `/get-session` into a 502.
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: "/auth/sign-in",
      consentPage: "/oauth/consent",
      scopes: ["openid", "profile", "email", "offline_access"],
      grantTypes: ["authorization_code", "refresh_token"],
      clientPrivileges: async ({ action, user }) => {
        if (!user || user.isAnonymous === true) return false;
        if (action !== "create") return true;

        const [result] = await db
          .select({ value: count() })
          .from(schema.oauthClient)
          .where(eq(schema.oauthClient.userId, user.id));
        return (result?.value ?? 0) < 10;
      },
      // The metadata endpoints are exposed at the public origin by the
      // app/.well-known route handlers.
      silenceWarnings: {
        oauthAuthServerConfig: true,
        openidConfig: true,
      },
    }),
    anonymous(),
    twoFactor(),
    passkey(),
    haveIBeenPwned(),
    lastLoginMethod(),
    organization({
      allowUserToCreateOrganization: true,
      membershipLimit: 50,
      organizationHooks: {
        afterCreateOrganization: async ({ organization, user }) => {
          await recordTeamAuditEvent({
            organizationId: organization.id,
            actorUserId: user.id,
            action: "org_created",
            metadata: { name: organization.name },
          });
        },
        afterAcceptInvitation: async ({ organization, member, user }) => {
          await updateTeamSeatCount(organization.id);
          await cancelPersonalSubscription(member.userId, organization.id);
          await recordTeamAuditEvent({
            organizationId: organization.id,
            actorUserId: user.id,
            targetUserId: user.id,
            action: "member_joined",
            metadata: { role: member.role },
          });
        },
        ...teamMemberAuditHooks,
        afterCreateInvitation: async ({ invitation, inviter, organization }) => {
          await recordTeamAuditEvent({
            organizationId: organization.id,
            actorUserId: inviter.id,
            action: "member_invited",
            metadata: { email: invitation.email, role: invitation.role },
          });
        },
        afterCancelInvitation: async ({ invitation, cancelledBy, organization }) => {
          await recordTeamAuditEvent({
            organizationId: organization.id,
            actorUserId: cancelledBy.id,
            action: "invitation_canceled",
            metadata: { email: invitation.email },
          });
        },
        afterRejectInvitation: async ({ invitation, user, organization }) => {
          // The invitee themselves declines — actor and target are the same
          // person (self-action), same shape as afterAcceptInvitation above.
          await recordTeamAuditEvent({
            organizationId: organization.id,
            actorUserId: user.id,
            targetUserId: user.id,
            action: "invitation_declined",
            metadata: { email: invitation.email },
          });
        },
        beforeUpdateOrganization: async ({ organization, member }) => {
          // afterUpdateOrganization only receives the updated row, not which fields
          // the request actually touched — `organization.name` is always present on
          // the row, so we can't tell a name change from e.g. a logo-only change
          // from there alone. This hook *does* receive the update payload (only the
          // fields being changed), so stash a marker directly on `member` — the
          // same object instance is passed to afterUpdateOrganization for this same
          // request — and read it back there to build precise audit metadata.
          (member as unknown as Record<string, unknown>).__auditChangedFields = {
            name: "name" in organization,
            logo: "logo" in organization,
          } satisfies OrgUpdateAuditMarker;
        },
        afterUpdateOrganization: async ({ organization, user, member }) => {
          if (!organization) return;
          const changedFields = (member as unknown as Record<string, unknown>)
            .__auditChangedFields as OrgUpdateAuditMarker | undefined;
          const metadata: Record<string, unknown> = {};
          if (changedFields?.name) metadata.name = organization.name;
          if (changedFields?.logo) metadata.logoChanged = true;
          await recordTeamAuditEvent({
            organizationId: organization.id,
            actorUserId: user.id,
            action: "org_updated",
            metadata,
          });
        },
        beforeDeleteOrganization: async ({ organization }) => {
          // billing.organizationId has no DB-level FK/cascade, so this must run
          // before the organization row (and its cascading member/invitation rows)
          // is removed. If Stripe cancellation fails, this throws and blocks the
          // deletion rather than leaving an orphaned, unmanageable subscription.
          await cancelTeamSubscriptionForDeletion(organization.id);
        },
      },
      sendInvitationEmail: emailEnabled
        ? async (data) => {
            const url = `${env.NEXT_PUBLIC_BETTER_AUTH_URL}/settings/team?invitationId=${data.id}`;
            await sendEmail({
              to: data.email,
              subject: orgInvitationEmailSubject(data.organization.name),
              react: createElement(OrgInvitationEmail, {
                orgName: data.organization.name,
                inviterName: data.inviter.user.name,
                acceptUrl: url,
              }),
            });
          }
        : undefined,
    }),
    ...(captchaPlugin ? [captchaPlugin] : []),
    ...(emailEnabled
      ? [
          magicLink({
            sendMagicLink: async ({ email, url }) => {
              await sendEmail({
                to: email,
                subject: magicLinkEmailSubject,
                react: createElement(MagicLinkEmail, {
                  signInUrl: url,
                }),
              });
            },
          }),
        ]
      : []),
  ],
  socialProviders,
  rateLimit: {
    enabled: true,
    window: 60, // time window in seconds
    max: 100, // max requests in the window
    customRules: {
      "/sign-in/*": {
        window: 10,
        max: 3,
      },
      "/two-factor/*": async (_request) => {
        // custom function to return rate limit window and max
        return {
          window: 10,
          max: 3,
        };
      },
    },
  },
  user: {
    // Two-step change for verified accounts: the current address must approve
    // the request first (sendChangeEmailConfirmation), then Better Auth sends
    // the new address a verification link via emailVerification; the email is
    // only updated after that link is opened. Unverified accounts skip the
    // first step and verify the new address directly.
    changeEmail: {
      enabled: emailEnabled,
      sendChangeEmailConfirmation: emailEnabled
        ? async ({ user, newEmail, url }) => {
            await sendEmail({
              to: user.email,
              subject: changeEmailConfirmationEmailSubject,
              react: createElement(ChangeEmailConfirmationEmail, {
                name: user.name,
                currentEmail: user.email,
                newEmail,
                confirmUrl: url,
                securityUrl: `${env.NEXT_PUBLIC_BETTER_AUTH_URL}/account/security`,
              }),
            });
          }
        : undefined,
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await deletePersonalStripeCustomers(user.id);
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
  },
  advanced: {
    database: {
      joins: true,
    },
    // Trust only the edge's single-value client IP header when configured. Otherwise
    // Better Auth accepts X-Forwarded-For only when it has exactly one entry.
    ...(env.CLIENT_IP_HEADER ? { ipAddress: { ipAddressHeaders: [env.CLIENT_IP_HEADER] } } : {}),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          // Guest / anonymous accounts are not gated by email domain.
          if (user.isAnonymous) return;
          if (!user.email) return;

          // Every non-guest sign-up passes here (email, magic link, OAuth), so a batch
          // from one network is stopped at a single point.
          const limit = await checkSignupLimits({
            email: user.email,
            ip: resolveSignupIp(ctx),
          });
          if (!limit.allowed) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: SIGNUP_RATE_LIMITED_MESSAGE,
              code: "SIGNUP_RATE_LIMITED",
            });
          }

          const path = typeof ctx?.path === "string" ? ctx.path : undefined;
          // OAuth (Google / GitHub) may use corporate domains — allow those.
          if (path?.startsWith("/callback/")) return;

          // Email/password, magic-link (new user), and other non-OAuth creates:
          // major providers + educational domains only (see email-domain-policy).
          assertAllowedSignupEmail(user.email);
        },
        after: async (user, ctx) => {
          if (user.isAnonymous || !user.email) return;
          try {
            await recordSignupRisk({
              userId: user.id,
              email: user.email,
              ip: resolveSignupIp(ctx),
              userAgent: resolveSignupUserAgent(ctx),
            });
          } catch (error) {
            // The account is already created; a failed assessment must not undo the sign-up.
            console.error("Failed to record sign-up risk", error);
          }
        },
      },
      update: {
        before: async (data) => {
          // Block change-email flows that switch to a disallowed domain.
          const email = typeof data.email === "string" ? data.email : undefined;
          if (!email) return;
          assertAllowedSignupEmail(email);
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          if (!session.userId) return;
          try {
            if (await isAnonymousUser(session.userId)) return;
            await recordSecurityActivity({
              userId: session.userId,
              action: "signed_in",
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
            });
          } catch (error) {
            console.error("Failed to record sign-in activity", error);
          }
        },
      },
    },
  },
});
