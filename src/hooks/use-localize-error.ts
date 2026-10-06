import { useExtracted } from "next-intl";
import { useCallback, useMemo } from "react";
import { type ErrorDictionary, mapKeys, resolveErrorMessage } from "@/lib/localize-error";

/**
 * Returns a function that turns an error from better-auth, tRPC, a route
 * handler or the network into a message in the user's language.
 *
 * Server messages stay English (API clients rely on them), so they are matched
 * by code or exact text here. Unknown messages are shown unchanged. Add new
 * server messages to the tables below.
 */
export function useLocalizeError() {
  const t = useExtracted();

  const dictionary = useMemo<ErrorDictionary>(
    () => ({
      byCode: {
        ...mapKeys(t("User not found"), "USER_NOT_FOUND"),
        ...mapKeys(t("Failed to create user"), "FAILED_TO_CREATE_USER"),
        ...mapKeys(
          t("Failed to create session"),
          "FAILED_TO_CREATE_SESSION",
          "COULD_NOT_CREATE_SESSION",
          "UNABLE_TO_CREATE_SESSION",
        ),
        ...mapKeys(t("Failed to update user"), "FAILED_TO_UPDATE_USER"),
        ...mapKeys(t("Failed to get session"), "FAILED_TO_GET_SESSION"),
        ...mapKeys(t("Invalid password"), "INVALID_PASSWORD"),
        ...mapKeys(t("Invalid email"), "INVALID_EMAIL"),
        ...mapKeys(t("Invalid email or password"), "INVALID_EMAIL_OR_PASSWORD"),
        ...mapKeys(t("Invalid user"), "INVALID_USER"),
        ...mapKeys(
          t("This account is already linked"),
          "SOCIAL_ACCOUNT_ALREADY_LINKED",
          "LINKED_ACCOUNT_ALREADY_EXISTS",
        ),
        ...mapKeys(t("Sign-in provider not found"), "PROVIDER_NOT_FOUND"),
        ...mapKeys(t("Invalid token"), "INVALID_TOKEN"),
        ...mapKeys(t("Token expired"), "TOKEN_EXPIRED"),
        ...mapKeys(t("Failed to get user info"), "FAILED_TO_GET_USER_INFO"),
        ...mapKeys(t("User email not found"), "USER_EMAIL_NOT_FOUND"),
        ...mapKeys(t("Email not verified"), "EMAIL_NOT_VERIFIED"),
        ...mapKeys(t("Password too short"), "PASSWORD_TOO_SHORT"),
        ...mapKeys(t("Password too long"), "PASSWORD_TOO_LONG"),
        ...mapKeys(t("User already exists"), "USER_ALREADY_EXISTS"),
        ...mapKeys(
          t("This email is already registered. Use another email."),
          "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        ),
        ...mapKeys(t("Email can not be updated"), "EMAIL_CAN_NOT_BE_UPDATED"),
        ...mapKeys(t("Changing email is disabled"), "CHANGE_EMAIL_DISABLED"),
        ...mapKeys(
          t("Password sign-in isn't set up for this account"),
          "CREDENTIAL_ACCOUNT_NOT_FOUND",
        ),
        ...mapKeys(t("Session expired. Sign in again to perform this action."), "SESSION_EXPIRED"),
        ...mapKeys(t("You can't unlink your last sign-in method"), "FAILED_TO_UNLINK_LAST_ACCOUNT"),
        ...mapKeys(t("Account not found"), "ACCOUNT_NOT_FOUND"),
        ...mapKeys(
          t("A password is already set. Enter it to delete the account."),
          "USER_ALREADY_HAS_PASSWORD",
        ),
        ...mapKeys(
          t("Sign-in from another site was blocked"),
          "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED",
        ),
        ...mapKeys(t("Verification email isn't enabled"), "VERIFICATION_EMAIL_NOT_ENABLED"),
        ...mapKeys(t("Email is already verified"), "EMAIL_ALREADY_VERIFIED"),
        ...mapKeys(t("Email mismatch"), "EMAIL_MISMATCH"),
        ...mapKeys(t("Please sign in again to continue"), "SESSION_NOT_FRESH"),
        ...mapKeys(t("Invalid request origin"), "INVALID_ORIGIN"),
        ...mapKeys(t("Invalid callback URL"), "INVALID_CALLBACK_URL"),
        ...mapKeys(t("Invalid redirect URL"), "INVALID_REDIRECT_URL"),
        ...mapKeys(t("Unable to create verification"), "FAILED_TO_CREATE_VERIFICATION"),
        ...mapKeys(t("Validation error"), "VALIDATION_ERROR"),
        ...mapKeys(t("A required field is missing"), "MISSING_FIELD"),
        ...mapKeys(t("A password is already set"), "PASSWORD_ALREADY_SET"),
        ...mapKeys(t("Please complete the CAPTCHA"), "MISSING_RESPONSE"),
        ...mapKeys(t("CAPTCHA verification failed. Please try again."), "VERIFICATION_FAILED"),
        ...mapKeys(
          t(
            "Gmail addresses must sign in with Google. Please use the Continue with Google button.",
          ),
          "EMAIL_USE_GOOGLE_OAUTH",
        ),
        ...mapKeys(
          t(
            "This email looks like an alias (plus tags or unusual dots). Please use your primary email address without +tags.",
          ),
          "EMAIL_ALIAS_NOT_ALLOWED",
        ),
        ...mapKeys(t("Please enter a valid email address."), "EMAIL_INVALID"),
        ...mapKeys(
          t(
            "Please use a major email provider (Outlook, iCloud, Proton, etc.) or a restricted educational address (e.g. .edu, .ac.jp, .ac.uk, .edu.au). Gmail requires Continue with Google. To request adding another email domain, contact contact@deniai.app.",
          ),
          "EMAIL_DOMAIN_NOT_ALLOWED",
        ),
        ...mapKeys(t("Too many requests. Please try again later."), "TOO_MANY_REQUESTS"),
        ...mapKeys(t("The passkey request expired. Please try again."), "CHALLENGE_NOT_FOUND"),
        ...mapKeys(
          t("You are not allowed to register this passkey"),
          "YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY",
        ),
        ...mapKeys(t("Failed to verify the passkey registration"), "FAILED_TO_VERIFY_REGISTRATION"),
        ...mapKeys(t("Passkey not found"), "PASSKEY_NOT_FOUND"),
        ...mapKeys(t("Authentication failed"), "AUTHENTICATION_FAILED"),
        ...mapKeys(t("Failed to update the passkey"), "FAILED_TO_UPDATE_PASSKEY"),
        ...mapKeys(
          t("This passkey is already registered"),
          "PREVIOUSLY_REGISTERED",
          "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
        ),
        ...mapKeys(
          t("The passkey request was cancelled"),
          "REGISTRATION_CANCELLED",
          "ERROR_CEREMONY_ABORTED",
        ),
        ...mapKeys(t("Passkey sign-in was cancelled or failed"), "AUTH_CANCELLED"),
        ...mapKeys(t("An unknown error occurred"), "UNKNOWN_ERROR"),
        ...mapKeys(t("Sign in to register a passkey"), "SESSION_REQUIRED"),
        ...mapKeys(
          t("Passkeys can't be used on this domain"),
          "ERROR_INVALID_DOMAIN",
          "ERROR_INVALID_RP_ID",
        ),
        ...mapKeys(
          t("This device can't store passkeys"),
          "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
        ),
        ...mapKeys(
          t("This device doesn't support the required user verification"),
          "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
        ),
        ...mapKeys(
          t("This device doesn't support the required passkey algorithms"),
          "ERROR_AUTHENTICATOR_NO_SUPPORTED_ALGORITHMS",
        ),
        ...mapKeys(
          t("The device couldn't create the passkey"),
          "ERROR_AUTHENTICATOR_GENERAL_ERROR",
        ),
        ...mapKeys(t("One-time passwords aren't enabled"), "OTP_NOT_ENABLED"),
        ...mapKeys(t("One-time passwords aren't available"), "OTP_NOT_CONFIGURED"),
        ...mapKeys(t("The one-time password has expired"), "OTP_HAS_EXPIRED"),
        ...mapKeys(t("Authenticator app verification isn't enabled"), "TOTP_NOT_ENABLED"),
        ...mapKeys(t("Authenticator app verification is already enabled"), "TOTP_ALREADY_ENABLED"),
        ...mapKeys(t("Authenticator app verification isn't available"), "TOTP_NOT_CONFIGURED"),
        ...mapKeys(t("Two-factor authentication isn't enabled"), "TWO_FACTOR_NOT_ENABLED"),
        ...mapKeys(t("Backup codes aren't enabled"), "BACKUP_CODES_NOT_ENABLED"),
        ...mapKeys(t("Invalid backup code"), "INVALID_BACKUP_CODE"),
        ...mapKeys(t("Invalid code"), "INVALID_CODE"),
        ...mapKeys(
          t("Too many attempts. Please request a new code."),
          "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
        ),
        ...mapKeys(
          t(
            "Too many failed attempts. Your account is temporarily locked. Please try again later.",
          ),
          "ACCOUNT_TEMPORARILY_LOCKED",
        ),
        ...mapKeys(
          t("Your two-factor session expired. Please sign in again."),
          "INVALID_TWO_FACTOR_COOKIE",
        ),
        ...mapKeys(
          t("You are not allowed to create a team"),
          "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION",
        ),
        ...mapKeys(
          t("You have reached the maximum number of teams"),
          "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
          "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS",
        ),
        ...mapKeys(t("A team with this name already exists"), "ORGANIZATION_ALREADY_EXISTS"),
        ...mapKeys(t("This team URL is already taken"), "ORGANIZATION_SLUG_ALREADY_TAKEN"),
        ...mapKeys(t("Team not found"), "ORGANIZATION_NOT_FOUND", "TEAM_NOT_FOUND"),
        ...mapKeys(
          t("That user isn't a member of this team"),
          "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
        ),
        ...mapKeys(
          t("You are not allowed to update this team"),
          "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION",
        ),
        ...mapKeys(
          t("You are not allowed to delete this team"),
          "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION",
        ),
        ...mapKeys(t("No active team"), "NO_ACTIVE_ORGANIZATION"),
        ...mapKeys(
          t("That user is already a member of this team"),
          "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION",
        ),
        ...mapKeys(t("Member not found"), "MEMBER_NOT_FOUND"),
        ...mapKeys(t("Role not found"), "ROLE_NOT_FOUND"),
        ...mapKeys(
          t("You can't leave the team as its only owner"),
          "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
          "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
        ),
        ...mapKeys(
          t("You are not allowed to remove this member"),
          "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
        ),
        ...mapKeys(
          t("You are not allowed to invite people to this team"),
          "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION",
        ),
        ...mapKeys(
          t("That user has already been invited"),
          "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
        ),
        ...mapKeys(
          t("Invitation not found"),
          "INVITATION_NOT_FOUND",
          "FAILED_TO_RETRIEVE_INVITATION",
        ),
        ...mapKeys(
          t("This invitation was sent to someone else"),
          "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
        ),
        ...mapKeys(
          t("Verify your email before responding to an invitation"),
          "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
        ),
        ...mapKeys(
          t("Verify your email to view invitations"),
          "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION",
        ),
        ...mapKeys(
          t("You are not allowed to cancel this invitation"),
          "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION",
        ),
        ...mapKeys(
          t("The person who invited you is no longer a member of the team"),
          "INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION",
        ),
        ...mapKeys(
          t("You are not allowed to invite someone with this role"),
          "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE",
        ),
        ...mapKeys(
          t("You are not allowed to update this member"),
          "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
        ),
        ...mapKeys(
          t("The team has reached its member limit"),
          "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
          "TEAM_MEMBER_LIMIT_REACHED",
        ),
        ...mapKeys(t("The invitation limit has been reached"), "INVITATION_LIMIT_REACHED"),
        ...mapKeys(
          t("You are not a member of this team"),
          "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION",
        ),
        ...mapKeys(
          t("You are not allowed to access this team"),
          "YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION",
        ),
        ...mapKeys(
          t("You're already signed in as a guest"),
          "ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY",
        ),
      },
      byMessage: {
        ...mapKeys(
          t("Too many requests. Please try again later."),
          "Too many requests. Please try again later.",
          "Too many requests",
        ),
        ...mapKeys(
          t("A question and an answer are required."),
          "A question and an answer are required.",
        ),
        ...mapKeys(
          t("Add an English title, description, and body before publishing."),
          "Add an English title, description, and body before publishing.",
        ),
        ...mapKeys(
          t("Affiliate administration access is not configured for this account."),
          "Affiliate administration access is not configured for this account.",
        ),
        ...mapKeys(
          t("An active team subscription is required to manage Max Mode."),
          "An active team subscription is required to manage Max Mode.",
        ),
        ...mapKeys(
          t("Another post already uses that slug."),
          "Another post already uses that slug.",
        ),
        ...mapKeys(t("API key not found."), "API key not found."),
        ...mapKeys(t("Billing is disabled."), "Billing is disabled."),
        ...mapKeys(
          t("Blog administration is not enabled for this account."),
          "Blog administration is not enabled for this account.",
        ),
        ...mapKeys(t("Both conversations need an answer."), "Both conversations need an answer."),
        ...mapKeys(
          t("Cancel your subscription before removing the card."),
          "Cancel your subscription before removing the card.",
        ),
        ...mapKeys(t("Chat ID is required"), "Chat ID is required"),
        ...mapKeys(t("Chat not found"), "Chat not found"),
        ...mapKeys(t("Choose two different models."), "Choose two different models."),
        ...mapKeys(t("Comparison not found."), "Comparison not found."),
        ...mapKeys(t("Comparison questions must match."), "Comparison questions must match."),
        ...mapKeys(t("Could not create the post."), "Could not create the post."),
        ...mapKeys(t("Could not publish the post."), "Could not publish the post."),
        ...mapKeys(t("Could not unpublish the post."), "Could not unpublish the post."),
        ...mapKeys(t("Could not update featured state."), "Could not update featured state."),
        ...mapKeys(t("Could not update the post."), "Could not update the post."),
        ...mapKeys(t("Coupon reward recipient not found."), "Coupon reward recipient not found."),
        ...mapKeys(
          t("Guest accounts cannot create API keys. Please sign in with an account."),
          "Guest accounts cannot create API keys. Please sign in with an account.",
        ),
        ...mapKeys(t("Invalid chat id"), "Invalid chat id"),
        ...mapKeys(
          t("Max Mode requires an active team subscription."),
          "Max Mode requires an active team subscription.",
        ),
        ...mapKeys(
          t("Maximum of 5 API keys allowed. Revoke an existing key first."),
          "Maximum of 5 API keys allowed. Revoke an existing key first.",
        ),
        ...mapKeys(
          t("Member does not belong to this organization."),
          "Member does not belong to this organization.",
        ),
        ...mapKeys(
          t("Memory is disabled in this environment."),
          "Memory is disabled in this environment.",
        ),
        ...mapKeys(
          t("Model comparison requires Pro or Max."),
          "Model comparison requires Pro or Max.",
        ),
        ...mapKeys(
          t("No active subscription found. Start with checkout instead."),
          "No active subscription found. Start with checkout instead.",
        ),
        ...mapKeys(t("No active subscription to cancel."), "No active subscription to cancel."),
        ...mapKeys(
          t("No active subscription to estimate against."),
          "No active subscription to estimate against.",
        ),
        ...mapKeys(t("No active team subscription found."), "No active team subscription found."),
        ...mapKeys(
          t("No active team subscription to cancel."),
          "No active team subscription to cancel.",
        ),
        ...mapKeys(
          t("No rate-limit reset credits are available."),
          "No rate-limit reset credits are available.",
        ),
        ...mapKeys(t("No subscription to resume."), "No subscription to resume."),
        ...mapKeys(t("No team subscription to resume."), "No team subscription to resume."),
        ...mapKeys(
          t("No users matched the selected reset target."),
          "No users matched the selected reset target.",
        ),
        ...mapKeys(
          t("Only card payment methods are supported."),
          "Only card payment methods are supported.",
        ),
        ...mapKeys(
          t("Only organization owners can manage team billing."),
          "Only organization owners can manage team billing.",
        ),
        ...mapKeys(
          t("Only organization owners or admins can manage this."),
          "Only organization owners or admins can manage this.",
        ),
        ...mapKeys(t("Payload too large (max 25 MB)"), "Payload too large (max 25 MB)"),
        ...mapKeys(
          t("Please wait a minute before exporting again."),
          "Please wait a minute before exporting again.",
        ),
        ...mapKeys(t("Post not found."), "Post not found."),
        ...mapKeys(t("Project not found"), "Project not found"),
        ...mapKeys(
          t("Publish the post before featuring it on the homepage."),
          "Publish the post before featuring it on the homepage.",
        ),
        ...mapKeys(
          t("Session does not belong to the current user."),
          "Session does not belong to the current user.",
        ),
        ...mapKeys(
          t("Session does not belong to the selected organization."),
          "Session does not belong to the selected organization.",
        ),
        ...mapKeys(t("Sign in before using billing."), "Sign in before using billing."),
        ...mapKeys(
          t("Stripe did not return a checkout client secret."),
          "Stripe did not return a checkout client secret.",
        ),
        ...mapKeys(
          t("Stripe did not return a client secret for the verification intent."),
          "Stripe did not return a client secret for the verification intent.",
        ),
        ...mapKeys(
          t("Subscription has no billable items to estimate."),
          "Subscription has no billable items to estimate.",
        ),
        ...mapKeys(
          t("Subscription has no billable items to update."),
          "Subscription has no billable items to update.",
        ),
        ...mapKeys(
          t("Target plan must be a subscription plan."),
          "Target plan must be a subscription plan.",
        ),
        ...mapKeys(
          t("Target plan must be a team subscription plan."),
          "Target plan must be a team subscription plan.",
        ),
        ...mapKeys(
          t("That slug is reserved by an existing built-in article."),
          "That slug is reserved by an existing built-in article.",
        ),
        ...mapKeys(
          t("This checkout session is not a personal plan purchase."),
          "This checkout session is not a personal plan purchase.",
        ),
        ...mapKeys(
          t("This coupon reward is already being processed or was already sent."),
          "This coupon reward is already being processed or was already sent.",
        ),
        ...mapKeys(
          t("This one-time plan has already been purchased."),
          "This one-time plan has already been purchased.",
        ),
        ...mapKeys(
          t("This reset reward is no longer pending."),
          "This reset reward is no longer pending.",
        ),
        ...mapKeys(
          t("This team already has an active subscription. Use Change plan or cancel first."),
          "This team already has an active subscription. Use Change plan or cancel first.",
        ),
        ...mapKeys(t("Unable to load team usage policy."), "Unable to load team usage policy."),
        ...mapKeys(t("Unknown plan."), "Unknown plan."),
        ...mapKeys(
          t("User profile missing an email address."),
          "User profile missing an email address.",
        ),
        ...mapKeys(
          t("Verification intent does not belong to you."),
          "Verification intent does not belong to you.",
        ),
        ...mapKeys(
          t("You already have an active subscription. Use Change plan or cancel first."),
          "You already have an active subscription. Use Change plan or cancel first.",
        ),
        ...mapKeys(t("You are not a member of that team."), "You are not a member of that team."),
        ...mapKeys(
          t("You do not have permission to manage this project."),
          "You do not have permission to manage this project.",
        ),
        ...mapKeys(
          t("Your card was declined. Please try a different card."),
          "Your card was declined. Please try a different card.",
        ),
        ...mapKeys(t("Unauthorized"), "Unauthorized"),
        ...mapKeys(
          t("Too many requests. Please slow down."),
          "Too many requests. Please slow down.",
        ),
        ...mapKeys(t("Unknown model"), "Unknown model"),
        ...mapKeys(t("Invalid request"), "Invalid request", "Invalid request body"),
        ...mapKeys(t("Code expired"), "Code expired"),
        ...mapKeys(
          t("Deni AI API is not configured in the current environment."),
          "Deni AI API is not configured in the current environment.",
        ),
        ...mapKeys(t("Failed to create chat"), "Failed to create chat"),
        ...mapKeys(t("Forbidden origin"), "Forbidden origin"),
        ...mapKeys(
          t("Guest accounts cannot authorize the Flixa extension. Please sign in with an account."),
          "Guest accounts cannot authorize the Flixa extension. Please sign in with an account.",
        ),
        ...mapKeys(t("Invalid action"), "Invalid action"),
        ...mapKeys(t("Invalid code"), "Invalid code"),
        ...mapKeys(t("Invalid comparison conversation."), "Invalid comparison conversation."),
        ...mapKeys(t("Invalid device code"), "Invalid device code"),
        ...mapKeys(t("Invalid messages payload"), "Invalid messages payload"),
        ...mapKeys(t("JSON content type required"), "JSON content type required"),
        ...mapKeys(t("No conversations found to import"), "No conversations found to import"),
        ...mapKeys(
          t("OpenRouter is not configured in the current environment."),
          "OpenRouter is not configured in the current environment.",
        ),
        ...mapKeys(
          t("This model is not configured in the current environment."),
          "This model is not configured in the current environment.",
        ),
        ...mapKeys(t("Unable to check usage"), "Unable to check usage"),
        ...mapKeys(t("Unknown provider"), "Unknown provider"),
        ...mapKeys(
          t("Coupon email was sent, but the reward could not be recorded."),
          "Coupon email was sent, but the reward could not be recorded.",
        ),
        ...mapKeys(
          t("Unable to create personal billing record"),
          "Unable to create personal billing record",
        ),
        ...mapKeys(
          t("Unable to create team billing record."),
          "Unable to create team billing record.",
        ),
        ...mapKeys(t("Failed to approve"), "Failed to approve"),
        ...mapKeys(t("Unknown error"), "Unknown error"),
        ...mapKeys(t("Ad edit rejected"), "Ad edit rejected"),
        ...mapKeys(t("Ads are unavailable"), "Ads are unavailable"),
        ...mapKeys(t("Already approved"), "Already approved"),
        ...mapKeys(t("Campaign cannot be edited"), "Campaign cannot be edited"),
        ...mapKeys(
          t("Campaign changed; refresh and try again"),
          "Campaign changed; refresh and try again",
        ),
        ...mapKeys(
          t("Campaign unavailable or fixed slot occupied"),
          "Campaign unavailable or fixed slot occupied",
        ),
        ...mapKeys(t("Checkout unavailable"), "Checkout unavailable"),
        ...mapKeys(t("Daily review limit reached"), "Daily review limit reached"),
        ...mapKeys(t("Daily submission limit reached"), "Daily submission limit reached"),
        ...mapKeys(t("Invalid creative"), "Invalid creative"),
        ...mapKeys(t("Invalid creative or budget"), "Invalid creative or budget"),
        ...mapKeys(t("Invalid placement"), "Invalid placement"),
        ...mapKeys(t("Review unavailable"), "Review unavailable"),
        ...mapKeys(
          t("Review unavailable; please try again later"),
          "Review unavailable; please try again later",
        ),
        ...mapKeys(t("Too many uploads. Please slow down."), "Too many uploads. Please slow down."),
        ...mapKeys(t("Text file is too large (max 2 MB)."), "Text file is too large (max 2 MB)."),
        ...mapKeys(t("Attachment is too large."), "Attachment is too large."),
        ...mapKeys(t("File is required."), "File is required."),
        ...mapKeys(t("Unsupported attachment type."), "Unsupported attachment type."),
        ...mapKeys(
          t(
            "Attachment upload failed. Inline fallback is limited to 512KB when storage is unavailable.",
          ),
          "Attachment upload failed. Inline fallback is limited to 512KB when storage is unavailable.",
        ),
        ...mapKeys(t("Attachment upload failed."), "Attachment upload failed."),
        ...mapKeys(
          t("This browser can't read HEIC images. Please convert it to JPEG or PNG."),
          "This browser can't read HEIC images. Please convert it to JPEG or PNG.",
        ),
        ...mapKeys(
          t("This image format isn't supported. Please use JPEG, PNG, WebP or PDF."),
          "This image format isn't supported. Please use JPEG, PNG, WebP or PDF.",
        ),
      },
      patterns: [
        {
          pattern: /^Unable to load (.+) price\. Configure lookup_key=(.+) in Stripe\.$/,
          format: ([, plan, key]) =>
            t("Unable to load the {plan} price. Configure lookup_key={key} in Stripe.", {
              plan,
              key,
            }),
        },
        {
          pattern: /^Verification not yet authorized \(status: (.+)\)\.$/,
          format: ([, status]) =>
            t("Verification hasn't been authorized yet (status: {status}).", { status }),
        },
      ],
      byTrpcCode: {
        ...mapKeys(t("You need to sign in to do that"), "UNAUTHORIZED"),
        ...mapKeys(t("You don't have permission to do that"), "FORBIDDEN"),
        ...mapKeys(t("Not found"), "NOT_FOUND"),
        ...mapKeys(t("The request was invalid"), "BAD_REQUEST"),
        ...mapKeys(t("Too many requests. Please try again later."), "TOO_MANY_REQUESTS"),
        ...mapKeys(
          t("Something went wrong on our side. Please try again."),
          "INTERNAL_SERVER_ERROR",
        ),
        ...mapKeys(t("The request timed out. Please try again."), "TIMEOUT"),
        ...mapKeys(t("That conflicts with the current state. Refresh and try again."), "CONFLICT"),
        ...mapKeys(t("The data is too large"), "PAYLOAD_TOO_LARGE"),
      },
      network: t("Couldn't reach the server. Check your connection and try again."),
      invalidInput: t("Some of the input is invalid. Please check it and try again."),
    }),
    [t],
  );

  return useCallback(
    (error: unknown, fallback?: string) => resolveErrorMessage(error, dictionary, fallback),
    [dictionary],
  );
}
