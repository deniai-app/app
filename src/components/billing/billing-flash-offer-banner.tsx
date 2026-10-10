"use client";

import { Zap } from "lucide-react";
import { useExtracted } from "next-intl";
import { BILLING_PLANS_SECTION_ID } from "./billing-utils";
import { OfferCountdown } from "./offer-countdown";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";

export function BillingFlashOfferBanner({
  endsAt,
  percentOff,
  isUpTo,
  onViewOffer,
}: {
  endsAt: string;
  percentOff: number;
  isUpTo: boolean;
  onViewOffer: () => void;
}) {
  const t = useExtracted();
  const percent = percentOff.toString();

  return (
    <Card className="border-amber-500/40 bg-amber-500/10 ring-amber-500/20 dark:ring-amber-500/20">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <Zap className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold">
              {isUpTo
                ? t("Limited-time offer: up to {percent}% off", { percent })
                : t("Limited-time offer: {percent}% off", { percent })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("Yearly and lifetime plans. The discount is applied automatically at checkout.")}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              {t("Ends in")}
            </p>
            <OfferCountdown
              endsAt={endsAt}
              className="font-mono text-xl font-semibold text-amber-700 dark:text-amber-300"
            />
          </div>
          <Button
            onClick={() => {
              onViewOffer();
              document
                .getElementById(BILLING_PLANS_SECTION_ID)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {t("View offer")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
