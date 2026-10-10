"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useExtracted, useLocale } from "next-intl";
import type React from "react";
import { DocumentTitle } from "@/components/document-title";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import { authClient } from "@/lib/auth-client";
import { formatAppDate } from "@/lib/format-date";
import { isCheckoutSettingsRoute, isStandaloneSettingsRoute } from "@/lib/settings-routes";
import { trpc } from "@/lib/trpc/react";
import { settingsUsageQueryOptions } from "@/lib/usage-query-options";
import { cn, formatCompactUsageValue } from "@/lib/utils";
import { Progress } from "./ui/progress";

export default function SettingsWrapper({ children }: { children: React.ReactNode }) {
  const t = useExtracted();
  const locale = useLocale();
  const pathname = usePathname();
  const isStandaloneRoute = isStandaloneSettingsRoute(pathname);
  const { features } = usePlatformCapabilities();
  const billingDisabled = !features.billing;
  const isAnonymous = Boolean(authClient.useSession().data?.user?.isAnonymous);
  const statusQuery = trpc.billing.status.useQuery(undefined, {
    enabled: !billingDisabled && !isStandaloneRoute && !isAnonymous,
    staleTime: 60_000,
  });
  const usageQuery = trpc.billing.usage.useQuery(undefined, {
    enabled: !isStandaloneRoute,
    ...settingsUsageQueryOptions,
  });
  const blogAdminQuery = trpc.blog.canManage.useQuery(undefined, {
    enabled: !isStandaloneRoute,
  });

  // Always keep {children} in the tree. Returning only a Spinner drops the page
  // segment and breaks Next.js instant-navigation validation
  // (instant-unrendered-segment).
  if (isStandaloneRoute) {
    return (
      <div className="mx-auto w-full max-w-5xl pb-12 pt-4">
        <DocumentTitle title={isCheckoutSettingsRoute(pathname) ? t("Checkout") : t("Team")} />
        {children}
      </div>
    );
  }

  const isUsageLoading =
    usageQuery.isLoading || (!billingDisabled && !isAnonymous && statusQuery.isLoading);
  const status = statusQuery.data;
  const usage = usageQuery.data;
  const usages = usage?.usage;

  const plan =
    status?.planId
      ?.split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "";

  const settingsTabs = [
    {
      label: t("Appearance"),
      value: "appearance",
      href: "/settings/appearance",
    },
    {
      label: t("Billing"),
      value: "billing",
      href: "/settings/billing",
    },
    {
      label: t("Ads"),
      value: "ads",
      href: "/settings/ads",
    },
    ...(blogAdminQuery.data
      ? [
          {
            label: t("Blog"),
            value: "blog",
            href: "/settings/blog",
          },
        ]
      : []),
    {
      label: t("Projects"),
      value: "projects",
      href: "/settings/projects",
    },
    {
      label: t("Personalize"),
      value: "memory",
      href: "/settings/memory",
    },
    {
      label: t("API Keys"),
      value: "api-keys",
      href: "/settings/api-keys",
    },
    {
      label: t("Developer"),
      value: "developer",
      href: "/settings/developer",
    },
    {
      label: t("Import"),
      value: "import",
      href: "/settings/import",
    },
  ].filter(
    (tab) =>
      (!billingDisabled || tab.value !== "billing") && (features.memory || tab.value !== "memory"),
  );

  const currentTabItem =
    settingsTabs.find((tab) => pathname?.startsWith(tab.href)) ?? settingsTabs[0];
  const currentTab = currentTabItem.value;

  return (
    <div className="flex flex-col lg:flex-row gap-4 mx-auto w-full pb-12 pt-4 px-4 lg:px-0">
      <DocumentTitle title={currentTabItem.label} />
      <div className="flex flex-col gap-2 w-full lg:max-w-xs shrink-0">
        {isUsageLoading ? (
          <div className="flex min-h-24 items-center justify-center rounded-xl border border-muted-foreground/10 bg-muted/60">
            <Spinner className="size-5" />
          </div>
        ) : (
          <>
            {!billingDisabled && (
              <Card className="border-muted-foreground/10 bg-muted/60 shadow-none">
                <CardContent>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-muted-foreground">{t("Your Plan")}</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-semibold">{plan}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("Next update: {date}", {
                          date: status?.currentPeriodEnd
                            ? formatAppDate(status.currentPeriodEnd, locale)
                            : "—",
                        })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-muted-foreground/10 bg-muted/60 shadow-none">
              <CardContent>
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-muted-foreground">{t("Usage")}</span>
                  <span className="text-sm">
                    {t("Resets on {date}", {
                      date: usages?.[0]?.periodEnd
                        ? formatAppDate(usages[0].periodEnd, locale)
                        : "—",
                    })}
                  </span>
                  {usages?.map((usageItem) => {
                    const maxModeEnabled = features.billing && (usage?.maxModeEnabled ?? false);
                    const unitLabel = usageItem.unit === "tokens" ? t("tokens") : t("requests");
                    const hasLimit =
                      !maxModeEnabled && usageItem.limit !== null && usageItem.limit > 0;
                    const usedPercent = hasLimit
                      ? Math.min((usageItem.used / (usageItem.limit ?? 1)) * 100, 100)
                      : 0;
                    const remainingPercent = Math.max(100 - usedPercent, 0);
                    const summaryLabel = maxModeEnabled
                      ? `${formatCompactUsageValue(usageItem.used)} ${unitLabel}`
                      : hasLimit
                        ? t("{percent}% used", { percent: usedPercent.toFixed(1) })
                        : `${formatCompactUsageValue(usageItem.used)} ${unitLabel}`;
                    const progress = hasLimit ? usedPercent : 0;
                    const remainingLabel = maxModeEnabled
                      ? t("Unlimited")
                      : hasLimit
                        ? t("{percent}% remaining", { percent: remainingPercent.toFixed(1) })
                        : t("Unlimited");
                    const periodEndLabel = usageItem.periodEnd
                      ? formatAppDate(usageItem.periodEnd, locale)
                      : null;
                    return (
                      <div key={usageItem.category} className="space-y-2 text-sm py-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="capitalize">
                            {usageItem.category === "basic"
                              ? t("Basic models")
                              : t("Premium models")}
                          </span>
                          <span className="tabular-nums text-muted-foreground">{summaryLabel}</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{remainingLabel}</span>
                          {periodEndLabel && (
                            <span>{t("Resets {date}", { date: periodEndLabel })}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="w-full min-w-0 overflow-hidden">
        {/* Nav links (not real tabs) — avoids Base UI TabsTrigger + Link nativeButton issues */}
        <div className="-mx-4 mb-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <nav
            className="bg-muted group/tabs-list inline-flex h-9 w-max items-center justify-center rounded-xl p-[3px] text-muted-foreground lg:w-auto"
            aria-label={t("Settings")}
          >
            {settingsTabs.map((tab) => {
              const isActive = tab.value === currentTab;
              return (
                <Link
                  key={tab.value}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap capitalize transition-colors",
                    "text-foreground/60 hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
                    isActive &&
                      "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <Card>
          <CardContent className="pt-6 pb-4">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
