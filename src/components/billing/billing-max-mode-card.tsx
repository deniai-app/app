"use client";

import { Zap } from "lucide-react";
import { useExtracted, useLocale } from "next-intl";
import { formatMinorCurrency } from "@/lib/currency";
import { formatCompactUsageValue } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";

type MaxModeData = {
  eligible: boolean;
  currency?: string | null;
  enabled: boolean;
  usageBasic?: number;
  usagePremium?: number;
  estimatedCost?: number;
  pricing: {
    basic?: number;
    premium?: number;
    unitTokens?: number;
  };
};

export function BillingMaxModeCard({
  data,
  onToggle,
  isToggling,
}: {
  data: MaxModeData;
  onToggle: (enabled: boolean) => void;
  isToggling: boolean;
}) {
  const t = useExtracted();
  const locale = useLocale();
  const formatMaxModeCurrency = (amountMinor: number) =>
    formatMinorCurrency(amountMinor, data.currency, { currencyDisplay: "code" }, locale);

  return (
    <Card className="border-border/80">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">{t("Max Mode")}</CardTitle>
            {data.enabled && <Badge variant="secondary">{t("Active")}</Badge>}
          </div>
          <CardDescription>
            {t("Continue using Deni AI after reaching your limits with pay-per-use pricing.")}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="max-mode-toggle" className="text-sm text-muted-foreground">
            {data.enabled ? t("Enabled") : t("Disabled")}
          </Label>
          <Switch
            id="max-mode-toggle"
            checked={data.enabled}
            onCheckedChange={onToggle}
            disabled={isToggling || (!data.enabled && !data.eligible)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <div className="text-sm text-muted-foreground">{t("Basic model tokens")}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold">
                {formatCompactUsageValue(data.usageBasic ?? 0)}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("{price} / {tokens} tokens", {
                  price: formatMaxModeCurrency(data.pricing.basic ?? 1),
                  tokens: formatCompactUsageValue(data.pricing.unitTokens ?? 1_000),
                })}
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="text-sm text-muted-foreground">{t("Premium model tokens")}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold">
                {formatCompactUsageValue(data.usagePremium ?? 0)}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("{price} / {tokens} tokens", {
                  price: formatMaxModeCurrency(data.pricing.premium ?? 5),
                  tokens: formatCompactUsageValue(data.pricing.unitTokens ?? 1_000),
                })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
          <div className="text-sm text-muted-foreground">{t("Estimated cost this period")}</div>
          <div className="text-lg font-semibold">
            {formatMaxModeCurrency(data.estimatedCost ?? 0)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
