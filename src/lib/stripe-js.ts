"use client";

import { loadStripe } from "@stripe/stripe-js";
import { clientEnv } from "@/env.client";

export const stripeJsPromise = clientEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? // Resolve to null when the script is blocked or offline: consumers already
    // treat null as "Stripe.js failed to load", and a rejected module-level
    // promise would otherwise surface as an unhandled rejection.
    loadStripe(clientEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).catch((error: unknown) => {
      console.warn("Failed to load Stripe.js", error);
      return null;
    })
  : null;
