"use client";

import { useExtracted } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatTokenLimit } from "./team-utils";

export type TeamMaxModeDefaultPolicy = {
  maxModeEnabled: boolean;
  maxModeLimitBasic: number | null;
  maxModeLimitPremium: number | null;
};

export function TeamMaxModeDefaultPolicySection({
  policy,
  disabled,
  onPolicyChange,
  onLimitChange,
}: {
  policy: TeamMaxModeDefaultPolicy;
  disabled: boolean;
  onPolicyChange: (input: {
    maxModeEnabled: boolean;
    maxModeLimitBasic: number | null;
    maxModeLimitPremium: number | null;
  }) => void;
  onLimitChange: (input: {
    maxModeEnabled: boolean;
    maxModeLimitBasic: number | null;
    maxModeLimitPremium: number | null;
    category: "basic" | "premium";
    value: string;
  }) => void;
}) {
  const t = useExtracted();

  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t("Default member policy")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Applied to new members and members without custom settings.")}
          </p>
        </div>
        <Switch
          aria-label={t("Enable Max Mode by default")}
          checked={policy.maxModeEnabled}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onPolicyChange({
              maxModeEnabled: checked,
              maxModeLimitBasic: policy.maxModeLimitBasic,
              maxModeLimitPremium: policy.maxModeLimitPremium,
            })
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("Default basic token limit")}</Label>
          <Input
            className="h-8"
            defaultValue={formatTokenLimit(policy.maxModeLimitBasic)}
            disabled={disabled}
            inputMode="numeric"
            placeholder={t("Unlimited")}
            onBlur={(event) =>
              onLimitChange({
                maxModeEnabled: policy.maxModeEnabled,
                maxModeLimitBasic: policy.maxModeLimitBasic,
                maxModeLimitPremium: policy.maxModeLimitPremium,
                category: "basic",
                value: event.currentTarget.value,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label>{t("Default premium token limit")}</Label>
          <Input
            className="h-8"
            defaultValue={formatTokenLimit(policy.maxModeLimitPremium)}
            disabled={disabled}
            inputMode="numeric"
            placeholder={t("Unlimited")}
            onBlur={(event) =>
              onLimitChange({
                maxModeEnabled: policy.maxModeEnabled,
                maxModeLimitBasic: policy.maxModeLimitBasic,
                maxModeLimitPremium: policy.maxModeLimitPremium,
                category: "premium",
                value: event.currentTarget.value,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
