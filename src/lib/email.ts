/**
 * Transactional email via Cloudflare Email Sending REST API.
 *
 * Enabled when both CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are set.
 * Token needs Email Sending: Edit on the account.
 *
 * Docs: https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
 */

import type { ReactElement } from "react";
import { render } from "react-email";
import { env } from "@/env";
import { EMAIL_FROM } from "@/lib/constants";

type EmailAddress =
  | string
  | {
      address: string;
      name?: string;
    };

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  /** React Email element — rendered to html (+ plain text). */
  react?: ReactElement;
  html?: string;
  text?: string;
  /** Defaults to EMAIL_FROM (`Deni AI <noreply@deniai.app>`). */
  from?: string | EmailAddress;
  replyTo?: string | EmailAddress;
};

type CloudflareSendResult = {
  delivered: string[];
  permanent_bounces: string[];
  queued: string[];
  message_id?: string;
};

type CloudflareApiResponse = {
  success: boolean;
  errors?: { code: number; message: string }[];
  messages?: { code: number; message: string }[];
  result?: CloudflareSendResult | null;
};

/** True when Cloudflare Email Sending credentials are configured. */
export function isEmailConfigured(): boolean {
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
}

/**
 * Parse `Name <addr@domain>` or bare `addr@domain` into the REST shape.
 * Cloudflare accepts a plain string or `{ address, name }`.
 */
function normalizeFrom(from: string | EmailAddress): EmailAddress {
  if (typeof from !== "string") return from;

  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1]?.trim();
    const address = match[2]?.trim();
    if (address) {
      return name ? { name, address } : address;
    }
  }

  return from.trim();
}

/**
 * Send a transactional email through Cloudflare Email Sending.
 * Prefer `react` for templates under `src/emails/*`.
 */
export async function sendEmail(options: SendEmailOptions): Promise<CloudflareSendResult> {
  if (!isEmailConfigured()) {
    throw new Error(
      "Cloudflare Email Sending is not configured (set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN).",
    );
  }

  let html = options.html;
  let text = options.text;

  if (options.react) {
    const [renderedHtml, renderedText] = await Promise.all([
      render(options.react),
      render(options.react, { plainText: true }),
    ]);
    html = html ?? renderedHtml;
    text = text ?? renderedText;
  }

  if (!html && !text) {
    throw new Error("Email must include at least one of html, text, or react.");
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID!;
  const token = env.CLOUDFLARE_API_TOKEN!;
  const body: Record<string, unknown> = {
    from: normalizeFrom(options.from ?? EMAIL_FROM),
    to: options.to,
    subject: options.subject,
  };
  if (html) body.html = html;
  if (text) body.text = text;
  if (options.replyTo) body.reply_to = normalizeFrom(options.replyTo);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  let data: CloudflareApiResponse;
  try {
    data = (await response.json()) as CloudflareApiResponse;
  } catch {
    throw new Error(
      `Cloudflare Email Sending failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  if (!response.ok || !data.success || !data.result) {
    const detail =
      data.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ||
      `${response.status} ${response.statusText}`;
    throw new Error(`Cloudflare Email Sending failed: ${detail}`);
  }

  return data.result;
}
