import { env } from "@/env";

export const FLASH_OFFER_DURATION_HOURS = 24;

export function createFlashOfferEndAt(now = new Date()) {
  return new Date(now.getTime() + FLASH_OFFER_DURATION_HOURS * 60 * 60 * 1000);
}

export function isFlashOfferPlan(planId: string | null | undefined) {
  if (!planId) {
    return false;
  }

  return planId.endsWith("_yearly") || planId.endsWith("_lifetime");
}

export function isFlashOfferActive(flashOfferEndsAt: Date | null | undefined, now = new Date()) {
  if (!flashOfferEndsAt) {
    return false;
  }

  return flashOfferEndsAt.getTime() > now.getTime();
}

export function getFlashOfferCouponId() {
  return env.STRIPE_FLASH_OFFER_COUPON_ID ?? null;
}
