import type { Metadata } from "next";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { publicAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();
  const title = t("Privacy Policy");
  const description = t(
    "How Deni AI accesses, uses, stores, shares, retains, and deletes personal data, including Google user data from Sign in with Google.",
  );

  return {
    title,
    description,
    alternates: await publicAlternates("/legal/privacy-policy"),
    openGraph: {
      title: `${title} — Deni AI`,
      description,
    },
    twitter: {
      title: `${title} | Deni AI`,
      description,
    },
  };
}

function PolicySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-3 scroll-mt-28">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPolicyPage() {
  const t = useExtracted();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Deni AI Privacy Policy",
    url: "https://deniai.app/legal/privacy-policy",
    dateModified: "2026-09-04",
    isPartOf: {
      "@type": "WebSite",
      name: "Deni AI",
      url: "https://deniai.app",
    },
    about: {
      "@type": "SoftwareApplication",
      name: "Deni AI",
      url: "https://deniai.app",
      applicationCategory: "MultimediaApplication",
    },
  };

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("Last updated: 2026-09-04")}</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("Deni AI Privacy Policy")}
          </h1>
          <p className="text-base text-muted-foreground">
            {t(
              "This Privacy Policy explains how Deni AI (the Service), available at https://deniai.app, accesses, collects, uses, stores, shares, retains, and deletes information when you use the website, web app, desktop client, or Deni AI Flixa. It applies to Deni AI and is hosted on deniai.app, the same domain as the application.",
            )}
          </p>
          <p className="text-base text-muted-foreground">
            {t(
              "By using the Service, you agree to this Policy. If you do not agree, do not use the Service.",
            )}
          </p>
          <p className="text-base text-muted-foreground">
            <Link href="/legal/terms" className="underline underline-offset-4">
              {t("Read the Terms of Service")}
            </Link>
          </p>
        </div>

        <PolicySection id="who-we-are" title={t("1. Who we are")}>
          <p className="text-muted-foreground">
            {t(
              "Deni AI is a multi-model AI chat application. This Privacy Policy is the privacy policy for Deni AI, not a template or a parent-company policy for an unrelated product.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "Questions, access requests, correction requests, export requests, and deletion requests can be sent to contact@deniai.app.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="google-user-data" title={t("2. Google user data accessed by Deni AI")}>
          <p className="text-muted-foreground">
            {t(
              "If you choose Sign in with Google, Deni AI accesses Google user data through Google OAuth. The application requests only basic sign-in information: your Google account name, email address, profile picture, and a unique Google account identifier. We may also receive and store authentication tokens (such as ID tokens or access tokens) needed to complete sign-in and keep your Deni AI session authenticated.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "Deni AI does not access your Gmail, Google Drive, Google Calendar, Google Contacts, Google Docs, or other Google Workspace content. We do not request those Google API scopes.",
            )}
          </p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              {t(
                "Name: used as your Deni AI display name and in account, security, and team communications.",
              )}
            </li>
            <li>
              {t(
                "Email address: used to create and identify your account, send sign-in, verification, password-reset, team-invite, and other account emails, and to respond to support or privacy requests.",
              )}
            </li>
            <li>{t("Profile picture: used as your account avatar unless you replace it.")}</li>
            <li>
              {t(
                "Google account identifier: used to link your Google account to your Deni AI account, prevent duplicate accounts, and restore sign-in.",
              )}
            </li>
          </ul>
        </PolicySection>

        <PolicySection id="google-data-use" title={t("3. How Deni AI uses Google user data")}>
          <p className="text-muted-foreground">
            {t(
              "We use Google user data only to provide and improve user-facing features of Deni AI. Specifically, we use it to create your account, authenticate you, keep you signed in, display your profile in the Service, send account-related messages, prevent abuse and fraud, and provide customer support.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "We do not use Google user data for targeted advertising, personalized advertising, retargeted advertising, interest-based advertising, selling to data brokers, providing data to information resellers, determining credit-worthiness, lending, building unrelated databases, or training non-personalized AI or machine-learning models.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "Deni AI does not use Google Workspace APIs to develop, improve, or train non-personalized AI or ML models. Google user data obtained through Sign in with Google is not used to train Deni AI models or any generalized AI or ML models.",
            )}
          </p>
        </PolicySection>

        <PolicySection
          id="google-data-sharing"
          title={t("4. How Deni AI shares, transfers, or discloses Google user data")}
        >
          <p className="text-muted-foreground">
            {t(
              "We do not sell Google user data. We do not transfer or disclose Google user data to third parties for advertising, data brokerage, credit, lending, or training generalized AI or ML models.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "We may share Google user data only as needed to operate Deni AI: with infrastructure providers that host our application and database, with email delivery providers that send account messages, and with security or abuse-prevention systems. Those processors may process data only to provide their service to us.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "We may also disclose information if required by law, legal process, or government request, or to protect the rights, safety, or security of Deni AI, our users, or others. We do not transfer Google user data to third parties for purposes other than those described in this Policy.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="other-data" title={t("5. Other information we collect")}>
          <p className="text-muted-foreground">
            {t(
              "Whether you sign in with Google, GitHub, email, a passkey, or as a guest, we may collect the following categories of information.",
            )}
          </p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              {t(
                "Account information: name, email address, avatar, authentication provider identifiers, hashed password if you use email sign-in, passkey credentials, two-factor authentication secrets, and linked-account records.",
              )}
            </li>
            <li>
              {t(
                "GitHub sign-in data, if you choose that method: GitHub username or name, email address, avatar, and GitHub account identifier, used only to create and authenticate your Deni AI account.",
              )}
            </li>
            <li>
              {t(
                "Content you submit: prompts, chat messages, uploaded files and images, project descriptions and instructions, saved memories, custom instructions, and similar workspace content. Legacy project-file uploads and chat-share records created before those features were removed may remain stored with your account.",
              )}
            </li>
            <li>
              {t(
                "Usage and device data: IP address, user agent, approximate location derived from IP, timestamps, feature usage, error logs, and security-activity records used to operate, secure, and debug the Service.",
              )}
            </li>
            <li>
              {t(
                "Team and workspace data: organization name, membership, roles, invitations, and audit-log events if you use team features.",
              )}
            </li>
            <li>
              {t(
                "Billing information: plan status, customer and subscription identifiers, and transaction IDs. Payment card details are collected and processed by Stripe, not stored by Deni AI.",
              )}
            </li>
            <li>
              {t(
                "API keys you provide: Deni AI-issued API keys are stored as hashes. Provider credentials entered through the former BYOK feature remain encrypted, are no longer used by the Service, and are not included in exports.",
              )}
            </li>
            <li>
              {t(
                "Cookies and similar technologies used for authentication, locale, security, abuse prevention, and analytics, as described below.",
              )}
            </li>
          </ul>
        </PolicySection>

        <PolicySection id="how-we-use" title={t("6. How we use information")}>
          <p className="text-muted-foreground">
            {t("We use the information described in this Policy to:")}
          </p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              {t(
                "Provide, maintain, and improve the Service, including chat, models, memory, projects, teams, desktop, and Flixa.",
              )}
            </li>
            <li>
              {t(
                "Authenticate users, keep sessions secure, and support sign-in methods such as Google, GitHub, email, magic link, passkeys, and two-factor authentication.",
              )}
            </li>
            <li>
              {t(
                "Send prompts and attachments to the AI model provider you select so the Service can generate a response.",
              )}
            </li>
            <li>{t("Process payments, subscriptions, and usage-based billing.")}</li>
            <li>
              {t(
                "Monitor usage, enforce limits, prevent spam, fraud, and abuse, and protect the Service.",
              )}
            </li>
            <li>
              {t(
                "Communicate with you about the Service, including support, security, billing, and product updates.",
              )}
            </li>
            <li>{t("Comply with legal obligations and respond to lawful requests.")}</li>
          </ul>
        </PolicySection>

        <PolicySection id="ai-processing" title={t("7. AI processing of your content")}>
          <p className="text-muted-foreground">
            {t(
              "When you send a message, we transmit the relevant prompt, conversation context, and any attached files to the model provider needed to fulfill that request. Depending on the model you choose, that may include providers such as OpenAI, Anthropic, Google (Gemini and related generative-AI APIs), Groq, xAI, OpenRouter, and other model routers or gateways we use to deliver the selected model.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "If you enable web search, search queries and related context may be sent to a search provider such as Exa so the Service can retrieve sources. If you upload files, those files may be stored with our file-storage provider and sent to a model provider when needed for the task.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "We do not use your conversations to train our own models. Model providers process submitted content to generate the requested output and may have their own privacy policies and retention practices. Do not paste passwords, API keys, or other secrets into chat.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="sharing" title={t("8. How we share information")}>
          <p className="text-muted-foreground">
            {t(
              "We share information with service providers who help us operate the Service. We do not sell personal information. Current categories of processors include:",
            )}
          </p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              {t(
                "Google LLC: Sign in with Google; Google Analytics; and Google generative-AI APIs when you select a Gemini or related Google model.",
              )}
            </li>
            <li>{t("GitHub, Inc.: GitHub sign-in, if you use that method.")}</li>
            <li>
              {t("Stripe, Inc.: payment processing, subscriptions, invoices, and billing meters.")}
            </li>
            <li>
              {t(
                "Cloudflare, Inc.: transactional email, Turnstile bot protection, and related security or network services.",
              )}
            </li>
            <li>
              {t(
                "Database, hosting, file-storage, and rate-limiting providers that store application data, uploads, and operational metrics.",
              )}
            </li>
            <li>
              {t(
                "AI model providers and routers named above, solely to generate the output you requested.",
              )}
            </li>
          </ul>
          <p className="text-muted-foreground">
            {t(
              "Chat sharing is no longer available, and shared-chat links created before its removal are no longer served by Deni AI. Legacy share records remain in account data until deletion. Team members may see workspace content according to the roles you configure.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "We may also share information if required by law or to protect the rights and safety of Deni AI or others.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="cookies-ads" title={t("9. Cookies, analytics, and advertising")}>
          <p className="text-muted-foreground">
            {t(
              "We use cookies and similar technologies that are necessary to sign you in, remember locale and similar preferences, keep sessions secure, and prevent abuse. We also use Google Analytics to understand aggregated product usage, such as whether a chat message was sent.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "Free-tier users and signed-in anonymous guests may see Deni AI Ads in chat and on the homepage. Visitors without an account may also see homepage ads. Advertisers submit text ads for automated review and prepay through Stripe. We record ad views and clicks against your account or, for visitors without an account, a keyed hash of your IP address to prevent duplicate billing. Visitors sharing an IP address are treated as the same viewer for billing. Raw IP addresses are not stored in ad event records. We do not use your conversations or Google Sign-In profile to target ads. Opening an ad takes you to the advertiser's website, which has its own privacy practices. We do not send Google Sign-In user data to advertising systems for targeting, retargeting, or profiling.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "You can control cookies through your browser settings. Blocking some cookies may prevent sign-in or other features from working.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="retention" title={t("10. Data retention")}>
          <p className="text-muted-foreground">
            {t(
              "We retain personal information for as long as your account is active and as needed to provide the Service. Sessions typically expire after a limited period of inactivity. Security logs, billing records, and abuse-prevention records may be kept longer when needed for legitimate business, legal, tax, or security purposes.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "When a retention period expires for a given type of data, we delete or de-identify it, unless a longer period is required or permitted by law. Guest or anonymous accounts and clearly abusive accounts may be removed sooner.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="deletion" title={t("11. Deletion, export, and your choices")}>
          <p className="text-muted-foreground">
            {t(
              "You may access and update account information in Account settings. You may download a JSON copy of your profile, chats, memories, projects, and security activity from Account settings. Secrets such as passwords and API keys are not included in that export.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "You may delete your account from Account settings. Deletion may require password confirmation or email verification. You may also request deletion by emailing contact@deniai.app from the address on the account. When an account is deleted, we delete associated personal data, including Google user data stored for sign-in, subject to legal, billing, security, or fraud-prevention records we must keep.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "You can disconnect Google from Deni AI by unlinking the Google account in security settings or by removing Deni AI access in your Google Account permissions. Unlinking sign-in does not by itself delete your Deni AI account or chat history; use account deletion for that.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "Where required by applicable law, you may also request access, correction, restriction, or objection. We may need to verify the request before acting on it.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="security" title={t("12. How we protect information")}>
          <p className="text-muted-foreground">
            {t(
              "Security procedures are in place to protect the confidentiality of your data. We use HTTPS/TLS encryption in transit, access controls on production systems, hashed passwords, encrypted storage for legacy provider credentials saved through the former BYOK feature, and session controls. Account deletion and data-export tools are provided in the product.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "No method of transmission or storage is completely secure, so we cannot guarantee absolute security. You are responsible for keeping your credentials, passkeys, and devices secure and for not submitting secrets in prompts.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="transfers" title={t("13. International transfers")}>
          <p className="text-muted-foreground">
            {t(
              "Your information may be processed in countries other than your own, including countries where our infrastructure and subprocessors operate, and where data protection laws may differ. We take steps to protect your information when it is transferred, including using reputable processors and encrypted transport.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="children" title={t("14. Children's privacy")}>
          <p className="text-muted-foreground">
            {t(
              "The Service is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided personal information, contact us and we will delete it.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="changes" title={t("15. Changes to this Policy")}>
          <p className="text-muted-foreground">
            {t(
              "We may update this Policy from time to time, including when we change how we use Google user data. We will update the date above and, if the change is material, provide additional notice. Continued use of the Service after an update means you accept the revised Policy.",
            )}
          </p>
        </PolicySection>

        <PolicySection id="contact" title={t("16. Contact")}>
          <p className="text-muted-foreground">
            {t(
              "If you have questions about this Policy, Google user data, or a privacy request, contact Deni AI at:",
            )}
          </p>
          <p className="text-muted-foreground">
            <a href="mailto:contact@deniai.app" className="underline underline-offset-4">
              contact@deniai.app
            </a>
          </p>
          <p className="text-muted-foreground">
            <Link href="/contact" className="underline underline-offset-4">
              {t("Open the contact page")}
            </Link>
          </p>
        </PolicySection>
      </div>
    </main>
  );
}
