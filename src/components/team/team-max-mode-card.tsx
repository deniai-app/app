"use client";

import { ChevronRight, Download, History, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useAuditActionSentence } from "./team-audit-utils";
import { TeamMaxModeDefaultPolicySection } from "./team-max-mode-default-policy";
import { TeamMaxModeMemberRow, type TeamMaxModeMemberPolicy } from "./team-max-mode-member-row";
import { dateTimeFormatter, numberFormatter } from "./team-utils";

type DefaultPolicy = {
  maxModeEnabled: boolean;
  maxModeLimitBasic: number | null;
  maxModeLimitPremium: number | null;
};

type AuditEntry = {
  id: string;
  action: string;
  actorName?: string | null;
  actorEmail?: string | null;
  targetName?: string | null;
  targetEmail?: string | null;
  createdAt: Date | string;
};

type MaxModeSettings = {
  enabled: boolean;
  eligible: boolean;
  usageBasic: number;
  usagePremium: number;
  defaultPolicy?: DefaultPolicy | null;
  members: TeamMaxModeMemberPolicy[];
  auditLog: AuditEntry[];
};

export function TeamMaxModeCard({
  isLoading,
  settings,
  teamTogglePending,
  defaultPolicyPending,
  memberPolicyPending,
  onTeamToggle,
  onDefaultPolicyChange,
  onDefaultLimitChange,
  onMemberPolicyChange,
  onMemberLimitChange,
  onExportCsv,
}: {
  isLoading: boolean;
  settings?: MaxModeSettings | null;
  teamTogglePending: boolean;
  defaultPolicyPending: boolean;
  memberPolicyPending: boolean;
  onTeamToggle: (enabled: boolean) => void;
  onDefaultPolicyChange: (input: {
    maxModeEnabled: boolean;
    maxModeLimitBasic: number | null;
    maxModeLimitPremium: number | null;
  }) => void;
  onDefaultLimitChange: (input: {
    maxModeEnabled: boolean;
    maxModeLimitBasic: number | null;
    maxModeLimitPremium: number | null;
    category: "basic" | "premium";
    value: string;
  }) => void;
  onMemberPolicyChange: (input: {
    userId: string;
    maxModeEnabled: boolean;
    maxModeLimitBasic: number | null;
    maxModeLimitPremium: number | null;
  }) => void;
  onMemberLimitChange: (input: {
    userId: string;
    maxModeEnabled: boolean;
    maxModeLimitBasic: number | null;
    maxModeLimitPremium: number | null;
    category: "basic" | "premium";
    value: string;
  }) => void;
  onExportCsv: () => void;
}) {
  const t = useExtracted();
  const getActionSentence = useAuditActionSentence();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4 text-primary" />
              {t("Team Max Mode")}
            </CardTitle>
            <CardDescription>
              {t("Set the team-wide Max Mode switch and per-member overage token limits.")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!settings} onClick={onExportCsv}>
              <Download className="size-3.5" />
              {t("Export CSV")}
            </Button>
            <Switch
              aria-label={t("Enable Max Mode for the team")}
              checked={settings?.enabled ?? false}
              disabled={isLoading || !settings?.eligible || teamTogglePending}
              onCheckedChange={onTeamToggle}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Spinner />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("Status")}</p>
                <p className="mt-1 text-sm font-medium">
                  {settings?.enabled ? t("Enabled") : t("Disabled")}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("Basic Max Mode usage")}</p>
                <p className="mt-1 text-sm font-medium">
                  {numberFormatter.format(settings?.usageBasic ?? 0)} {t("tokens")}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{t("Premium Max Mode usage")}</p>
                <p className="mt-1 text-sm font-medium">
                  {numberFormatter.format(settings?.usagePremium ?? 0)} {t("tokens")}
                </p>
              </div>
            </div>

            {settings?.defaultPolicy && (
              <TeamMaxModeDefaultPolicySection
                policy={settings.defaultPolicy}
                disabled={isLoading || defaultPolicyPending}
                onPolicyChange={onDefaultPolicyChange}
                onLimitChange={onDefaultLimitChange}
              />
            )}

            <div className="space-y-2">
              <div className="hidden grid-cols-[minmax(0,1fr)_88px_120px_120px] gap-3 px-3 text-xs font-medium text-muted-foreground md:grid">
                <span>{t("Member")}</span>
                <span>{t("Enabled")}</span>
                <span>{t("Basic token limit")}</span>
                <span>{t("Premium token limit")}</span>
              </div>
              {settings?.members.map((memberPolicy) => (
                <TeamMaxModeMemberRow
                  key={memberPolicy.userId}
                  memberPolicy={memberPolicy}
                  disabled={isLoading || memberPolicyPending}
                  onPolicyChange={onMemberPolicyChange}
                  onLimitChange={onMemberLimitChange}
                />
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              <p>
                {t(
                  "Blank member limits allow unlimited Max Mode token overage while the team switch is enabled.",
                )}
              </p>
            </div>
            {settings?.auditLog.length ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <History className="size-3.5 text-muted-foreground" />
                  {t("Recent activity")}
                </div>
                <div className="space-y-2">
                  {settings.auditLog.map((entry) => {
                    const targetLabel = entry.targetName || entry.targetEmail || null;
                    const sentence = getActionSentence(entry.action, targetLabel);

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {entry.actorName || entry.actorEmail}
                          </span>{" "}
                          {sentence}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {dateTimeFormatter.format(new Date(entry.createdAt))}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  render={<Link href="/settings/team/audit-log" />}
                  nativeButton={false}
                >
                  {t("View full audit log")}
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
