import dynamic from "next/dynamic";
import { captchaPlugin as coreCaptchaPlugin } from "@better-auth-ui/react/plugins/captcha";

// Defer Turnstile script/package until an auth form (or the guest sign-in
// challenge) actually mounts the captcha
export const LazyTurnstileCaptcha = dynamic(
  () => import("@/components/auth/turnstile-captcha").then((mod) => mod.TurnstileCaptcha),
  { ssr: false },
);

/**
 * Registers Cloudflare Turnstile for better-auth-ui forms
 * (sign-in, sign-up, forgot-password, magic-link).
 * Guest sign-in renders the same widget in `GuestCaptchaDialog`.
 */
export const captchaPlugin = () =>
  coreCaptchaPlugin({
    render: LazyTurnstileCaptcha,
  });
