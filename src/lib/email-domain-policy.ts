/**
 * Email domain policy for credential / magic-link sign-up.
 *
 * Allowlist model:
 *  1. Known major consumer mail providers (exact domain match)
 *  2. Educational domains only under TLDs / SLDs with **restricted
 *     registration** (real schools / universities), not open `.edu.<cc>`
 *     namespaces that are routinely sold as throwaway mail
 *
 * Extra anti-abuse rules on email-based registration:
 *  - Gmail / Googlemail must use Google OAuth (aliases share one inbox;
 *    password/magic-link sign-up cannot prove primary ownership).
 *  - **All domains** reject alias-like local parts (`+` tags, fragmented
 *    dots) so bot farms cannot hop providers.
 *  - Letters followed by digits are advisory only: legitimate names often
 *    include a birth year. They use the existing CAPTCHA / email-verification
 *    signup flow when configured, rather than being rejected as aliases.
 *
 * OAuth (Google / GitHub) is not gated by this module — those identities
 * are already provider-verified. Apply only on email-based registration
 * paths (see auth.ts).
 */

/** Google consumer mail — email/password and magic-link sign-up forbidden. */
export const GOOGLE_MAIL_DOMAINS: ReadonlySet<string> = new Set(["gmail.com", "googlemail.com"]);

/** Microsoft free consumer mail — alias-like local parts rejected. */
export const MICROSOFT_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.com",
  "live.jp",
  "msn.com",
]);

/** Exact domains allowed for email/password and magic-link sign-up. */
export const ALLOWED_EMAIL_PROVIDERS: ReadonlySet<string> = new Set([
  // Microsoft (primary address only — see alias checks)
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.com",
  "live.jp",
  "msn.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // Yahoo
  "yahoo.com",
  "yahoo.co.jp",
  "ymail.com",
  "rocketmail.com",
  // Proton
  "proton.me",
  "protonmail.com",
  "pm.me",
  // Privacy-focused / other major
  "aol.com",
  "zoho.com",
  "zohomail.com",
  "fastmail.com",
  "fastmail.fm",
  "hey.com",
  "duck.com",
  "tutanota.com",
  "tuta.com",
  "tutamail.com",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "mail.com",
  "icloud.com.jp",
  // Yandex / Mail.ru ecosystem
  "yandex.com",
  "yandex.ru",
  "ya.ru",
  "mail.ru",
  "bk.ru",
  "inbox.ru",
  "list.ru",
  // East Asia majors
  "qq.com",
  "163.com",
  "126.com",
  "sina.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "kakao.com",
  // Japan mobile carriers (common primary addresses)
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "softbank.ne.jp",
  "i.softbank.jp",
  "au.com",
  "uqmobile.jp",
  "ymobile.ne.jp",
  "rakuten.jp",
  // Other common
  "web.de",
  "t-online.de",
  "orange.fr",
  "free.fr",
  "laposte.net",
  "libero.it",
  "virgilio.it",
  "wp.pl",
  "o2.pl",
  "seznam.cz",
  "btinternet.com",
  "sky.com",
  "virginmedia.com",
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "cox.net",
  "charter.net",
  "earthlink.net",
]);

/**
 * Educational domain suffixes with restricted registration (institutions only).
 *
 * Match when `domain === suffix` or `domain.endsWith("." + suffix)`.
 * Open / high-abuse namespaces (e.g. `.edu.kg`, bare `.ac` Ascension TLD,
 * most `.edu.<cc>` without real eligibility checks) are intentionally omitted.
 *
 * Add a suffix here only when the registry limits names to real schools.
 */
export const ALLOWED_EDU_DOMAIN_SUFFIXES: readonly string[] = [
  // United States — sponsored gTLD, eligibility-restricted
  "edu",
  // Japan — JPRS academic / school namespaces
  "ac.jp",
  "ed.jp",
  // United Kingdom — JANET academic / school
  "ac.uk",
  "sch.uk",
  // Australia — auDA education eligibility
  "edu.au",
  // New Zealand — academic
  "ac.nz",
  // South Korea — academic
  "ac.kr",
  // Taiwan — education
  "edu.tw",
  // Singapore — education
  "edu.sg",
  // Hong Kong — education
  "edu.hk",
];

export function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  // strip trailing dots / ignore display-name forms
  const domain = trimmed.slice(at + 1).replace(/\.+$/, "");
  if (!domain || domain.includes(" ") || domain.includes("@")) return null;
  return domain;
}

export function extractEmailLocalPart(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const local = trimmed.slice(0, at);
  if (!local || local.includes(" ")) return null;
  return local;
}

function domainMatchesSuffix(domain: string, suffix: string): boolean {
  return domain === suffix || domain.endsWith(`.${suffix}`);
}

/**
 * Educational domain check (restricted-registration allowlist only).
 * - `mit.edu`, `cs.stanford.edu` → allowed (US `.edu`)
 * - `u-tokyo.ac.jp`, `school.ed.jp` → allowed
 * - `ox.ac.uk`, `uni.edu.au` → allowed
 * - `cmuk.edu.kg`, `foo.edu.co`, bare `something.ac` → denied
 */
export function isAllowedEducationalDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  const labels = d.split(".").filter(Boolean);
  // Need at least school.edu or school.ac.jp
  if (labels.length < 2) return false;

  return ALLOWED_EDU_DOMAIN_SUFFIXES.some((suffix) => domainMatchesSuffix(d, suffix));
}

export function isGoogleMailDomain(domain: string): boolean {
  return GOOGLE_MAIL_DOMAINS.has(domain.toLowerCase());
}

export function isMicrosoftMailDomain(domain: string): boolean {
  return MICROSOFT_MAIL_DOMAINS.has(domain.toLowerCase());
}

export function isAllowedEmailProviderDomain(domain: string): boolean {
  return ALLOWED_EMAIL_PROVIDERS.has(domain.toLowerCase());
}

/**
 * Alias local-part checks for **any** email domain.
 *
 * Blocks:
 *  - plus addressing (`user+tag@…`, `scented2check+f7qspz@icloud.com`)
 *  - fragmented dots (`e.l.adu.v.a.r.61.5@…`, `a.b.c.d@…`)
 *  - consecutive dots / empty segments
 *
 * Allows normal names: `john.doe@…`, `jane_smith@…`, `j.doe@…`.
 */
export function isAliasLikeLocalPart(local: string): boolean {
  const l = local.trim().toLowerCase();
  if (!l) return true;

  // Plus aliases (and the random +tag farm).
  if (l.includes("+")) return true;

  // Empty segments / leading / trailing dots.
  if (l.startsWith(".") || l.endsWith(".") || l.includes("..")) return true;

  const segments = l.split(".");
  const dotCount = segments.length - 1;

  // Many dots are almost never a real primary mailbox name.
  if (dotCount >= 3) return true;

  // Three or more single-character segments → fragmented alias style.
  const singleCharSegments = segments.filter((segment) => segment.length === 1).length;
  if (singleCharSegments >= 3) return true;

  return false;
}

/**
 * Advisory signal for verification, never grounds to reject registration.
 * Also matches real users such as taro1990 and yamada2001. Email signups
 * already require Turnstile and mailbox verification when configured in auth.ts;
 * without those services this predicate remains available to future callers.
 */
export function isRandomLookingLocalPart(local: string): boolean {
  return /^[a-z]{4,14}\d{3,8}[a-z]{0,3}$/i.test(local.trim());
}

export type SignupEmailDenyReason =
  | "invalid"
  | "not_allowed"
  | "use_google_oauth"
  | "alias_not_allowed";

export type SignupEmailPolicyResult = { ok: true } | { ok: false; reason: SignupEmailDenyReason };

/**
 * Full sign-up policy for email/password and magic-link registration.
 * Does not apply to OAuth callbacks.
 */
export function checkSignupEmail(email: string): SignupEmailPolicyResult {
  const domain = extractEmailDomain(email);
  if (!domain) return { ok: false, reason: "invalid" };

  // Gmail aliases all deliver to one inbox; require Google-verified identity.
  if (isGoogleMailDomain(domain)) {
    return { ok: false, reason: "use_google_oauth" };
  }

  const local = extractEmailLocalPart(email);
  if (!local) return { ok: false, reason: "invalid" };

  // Unambiguous alias local parts rejected on every domain (provider, edu, etc.).
  if (isAliasLikeLocalPart(local)) {
    return { ok: false, reason: "alias_not_allowed" };
  }

  if (isAllowedEmailProviderDomain(domain)) return { ok: true };
  if (isAllowedEducationalDomain(domain)) return { ok: true };
  return { ok: false, reason: "not_allowed" };
}

export function signupEmailDenialMessage(reason: SignupEmailDenyReason): string {
  switch (reason) {
    case "use_google_oauth":
      return "Gmail addresses must sign in with Google. Please use the Continue with Google button.";
    case "alias_not_allowed":
      return "This email looks like an alias (plus tags or unusual dots). Please use your primary email address without +tags.";
    case "invalid":
      return "Please enter a valid email address.";
    case "not_allowed":
    default:
      return "Please use a major email provider (Outlook, iCloud, Proton, etc.) or a restricted educational address (e.g. .edu, .ac.jp, .ac.uk, .edu.au). Gmail requires Continue with Google. To request adding another email domain, contact contact@deniai.app.";
  }
}

export function signupEmailDenialCode(reason: SignupEmailDenyReason): string {
  switch (reason) {
    case "use_google_oauth":
      return "EMAIL_USE_GOOGLE_OAUTH";
    case "alias_not_allowed":
      return "EMAIL_ALIAS_NOT_ALLOWED";
    case "invalid":
      return "EMAIL_INVALID";
    case "not_allowed":
    default:
      return "EMAIL_DOMAIN_NOT_ALLOWED";
  }
}
