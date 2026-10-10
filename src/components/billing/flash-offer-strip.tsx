"use client";

import { ArrowRight, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useExtracted } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc/react";
import { OfferCountdown } from "./offer-countdown";

const DISMISSED_KEY = "deni-flash-offer-dismissed";
const DISMISSED_EVENT = "deni:flash-offer-dismissed";

function subscribeDismissed(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(DISMISSED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(DISMISSED_EVENT, onStoreChange);
  };
}

function getDismissedSnapshot() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function dismissOffer(endsAt: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, endsAt);
  } catch {
    // Storage may be unavailable (private mode); the strip just stays visible.
  }
  window.dispatchEvent(new Event(DISMISSED_EVENT));
}

/** App-wide flash offer strip for card-verified users who have not paid yet. */
export function FlashOfferStrip() {
  const t = useExtracted();
  const pathname = usePathname();
  const session = authClient.useSession();
  const { features } = usePlatformCapabilities();
  const utils = trpc.useUtils();
  const user = session.data?.user;
  // The billing page shows its own offer banner; checkout already applies it.
  const onBillingRoute = pathname?.startsWith("/settings/billing") ?? false;
  const offerQuery = trpc.billing.flashOffer.useQuery(undefined, {
    enabled: features.billing && Boolean(user) && !user?.isAnonymous,
    staleTime: 5 * 60_000,
  });
  const dismissedEndsAt = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
    () => null,
  );
  const offer = offerQuery.data;
  const offerEndsAt = offer?.endsAt;

  // Refetch at expiry so the strip disappears without a reload.
  useEffect(() => {
    if (!offerEndsAt) return;
    const timeout = setTimeout(
      () => void utils.billing.flashOffer.invalidate(),
      Math.max(0, new Date(offerEndsAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [offerEndsAt, utils]);

  if (!offer || onBillingRoute || dismissedEndsAt === offer.endsAt) return null;

  const percent = offer.percentOff.toString();

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
      <Zap aria-hidden="true" className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">
          {offer.isUpTo
            ? t("Limited-time offer: up to {percent}% off", { percent })
            : t("Limited-time offer: {percent}% off", { percent })}
        </span>
        <span className="hidden text-muted-foreground sm:inline">
          {t("Yearly and lifetime plans")}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          {t("Ends in")}
          <OfferCountdown
            endsAt={offer.endsAt}
            className="font-mono font-semibold text-amber-700 dark:text-amber-300"
          />
        </span>
      </div>
      <Button
        size="sm"
        className="h-7"
        render={<Link href="/settings/billing" />}
        nativeButton={false}
      >
        {t("View offer")}
        <ArrowRight data-icon="inline-end" className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => dismissOffer(offer.endsAt)}
        aria-label={t("Dismiss")}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
