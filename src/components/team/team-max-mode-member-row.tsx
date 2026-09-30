"use client";

import { useExtracted } from "next-intl";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatTokenLimit, numberFormatter } from "./team-utils";

export type TeamMaxModeMemberPolicy = {
  userId: string;
  name?: string | null;
  email: string;
  role: string;
  maxModeEnabled: boolean;
  maxModeLimitBasic: number | null;
  maxModeLimitPremium: number | null;
  maxModeUsageBasic: number;
  maxModeUsagePremium: number;
};

export function TeamMaxModeMemberRow({
  memberPolicy,
  disabled,
  onPolicyChange,
  onLimitChange,
}: {
  memberPolicy: TeamMaxModeMemberPolicy;
  disabled: boolean;
  onPolicyChange: (input: {
    userId: string;
    maxModeEnabled: boolean;
    maxModeLimitBasic: number | null;
    maxModeLimitPremium: number | null;
  }) => void;
  onLimitChange: (input: {
    userId: string;
    maxModeEnabled: boolean;
    maxModeLimitBasic: number | null;
    maxModeLimitPremium: number | null;
    category: "basic" | "premium";
    value: string;
  }) => void;
}) {
  const t = useExtracted();
  const displayName = memberPolicy.name || memberPolicy.email;

  return (
    <div className="grid grid-cols-1 items-center gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_88px_120px_120px]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{memberPolicy.email}</p>
      </div>
      <Switch
        aria-label={t("Enable Max Mode for {name}", { name: displayName })}
        checked={memberPolicy.maxModeEnabled}
        disabled={disabled}
        onCheckedChange={(checked) =>
          onPolicyChange({
            userId: memberPolicy.userId,
            maxModeEnabled: checked,
            maxModeLimitBasic: memberPolicy.maxModeLimitBasic,
            maxModeLimitPremium: memberPolicy.maxModeLimitPremium,
          })
        }
      />
      <div className="space-y-1">
        <Input
          aria-label={t("Basic Max Mode token limit for {name}", { name: displayName })}
          className="h-8"
          defaultValue={formatTokenLimit(memberPolicy.maxModeLimitBasic)}
          disabled={disabled}
          inputMode="numeric"
          placeholder={t("Unlimited")}
          onBlur={(event) =>
            onLimitChange({
              userId: memberPolicy.userId,
              maxModeEnabled: memberPolicy.maxModeEnabled,
              maxModeLimitBasic: memberPolicy.maxModeLimitBasic,
              maxModeLimitPremium: memberPolicy.maxModeLimitPremium,
              category: "basic",
              value: event.currentTarget.value,
            })
          }
        />
        <p className="text-[11px] text-muted-foreground">
          {t("Used {count}", {
            count: numberFormatter.format(memberPolicy.maxModeUsageBasic),
          })}
        </p>
      </div>
      <div className="space-y-1">
        <Input
          aria-label={t("Premium Max Mode token limit for {name}", { name: displayName })}
          className="h-8"
          defaultValue={formatTokenLimit(memberPolicy.maxModeLimitPremium)}
          disabled={disabled}
          inputMode="numeric"
          placeholder={t("Unlimited")}
          onBlur={(event) =>
            onLimitChange({
              userId: memberPolicy.userId,
              maxModeEnabled: memberPolicy.maxModeEnabled,
              maxModeLimitBasic: memberPolicy.maxModeLimitBasic,
              maxModeLimitPremium: memberPolicy.maxModeLimitPremium,
              category: "premium",
              value: event.currentTarget.value,
            })
          }
        />
        <p className="text-[11px] text-muted-foreground">
          {t("Used {count}", {
            count: numberFormatter.format(memberPolicy.maxModeUsagePremium),
          })}
        </p>
      </div>
    </div>
  );
}
