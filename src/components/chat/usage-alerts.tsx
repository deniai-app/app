"use client";

import { ArrowUpRight, Ban, TriangleAlert, Zap } from "lucide-react";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface UsageAlertsProps {
  status: {
    isAnonymous: boolean;
    isUsageLow: boolean;
    isUsageBlocked: boolean;
    canEnableMaxMode: boolean;
    billingDisabled: boolean;
  };
  usage: {
    remaining: number | null | undefined;
    unitLabel: string;
    categoryLabel: string;
    tierLabel: string;
  };
  enableMaxMode: { mutate: () => void; isPending: boolean };
  onRefreshUsage: () => void;
}

export function UsageAlerts({ status, usage, enableMaxMode, onRefreshUsage }: UsageAlertsProps) {
  const t = useExtracted();

  return (
    <>
      {(status.isUsageLow || status.isUsageBlocked) && (
        <Alert
          className={cn(
            "mt-3 border-amber-500/50 bg-amber-100/40 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50",
            status.isUsageBlocked &&
              !status.canEnableMaxMode &&
              "border-destructive/40 bg-destructive/10 text-destructive-foreground dark:border-destructive/30",
            status.canEnableMaxMode &&
              "border-blue-500/50 bg-blue-100/40 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-50",
          )}
        >
          {status.canEnableMaxMode ? (
            <Zap className="mt-0.5 size-4" />
          ) : status.isUsageBlocked ? (
            <Ban className="mt-0.5 size-4" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4" />
          )}
          <AlertTitle>
            {status.canEnableMaxMode
              ? t("Enable Max Mode to continue")
              : status.isUsageBlocked
                ? t("Usage limit reached")
                : t("You are running low")}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>
              {status.canEnableMaxMode
                ? t(
                    "You've reached your limit. Enable Max Mode to continue with pay-per-use pricing.",
                  )
                : status.isUsageBlocked
                  ? t("You've hit the {category} usage limit on your {tier} plan.", {
                      category: usage.categoryLabel,
                      tier: usage.tierLabel,
                    })
                  : usage.remaining === null || usage.remaining === undefined
                    ? t("Only a few {category} {unit} left on your {tier} plan.", {
                        category: usage.categoryLabel,
                        unit: usage.unitLabel,
                        tier: usage.tierLabel,
                      })
                    : t(
                        "Only {count, plural, one {#} other {#}} {category} {unit} left on your {tier} plan.",
                        {
                          count: usage.remaining,
                          category: usage.categoryLabel,
                          unit: usage.unitLabel,
                          tier: usage.tierLabel,
                        },
                      )}
            </p>
            <div className="flex flex-wrap gap-2">
              {status.canEnableMaxMode && (
                <Button
                  size="sm"
                  onClick={() => enableMaxMode.mutate()}
                  disabled={enableMaxMode.isPending}
                >
                  {enableMaxMode.isPending && <Spinner />}
                  <Zap className="size-3.5" />
                  {t("Enable Max Mode")}
                </Button>
              )}
              {!status.isAnonymous && !status.billingDisabled && !status.canEnableMaxMode && (
                <Button size="sm" render={<Link href="/settings/billing" />} nativeButton={false}>
                  {t("Upgrade plan")}
                  <ArrowUpRight className="size-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onRefreshUsage}>
                {t("Refresh usage")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
