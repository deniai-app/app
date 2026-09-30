"use client";

import { ArrowRight, History, RefreshCw } from "lucide-react";
import { useExtracted } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useReloadCooldown } from "@/hooks/use-reload-cooldown";
import { trpc } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import {
  useAuditActionMeta,
  useAuditActionSentence,
  useFormatAuditChanges,
  getInitials,
} from "./team-audit-utils";
import { useTeamSettingsContext } from "./team-settings-context";
import { dateTimeFormatter, monthDayYearFormatter } from "./team-utils";

export function TeamAuditLogPage() {
  const t = useExtracted();
  const { activeOrg, isAdmin } = useTeamSettingsContext();
  const getActionMeta = useAuditActionMeta();
  const getActionSentence = useAuditActionSentence();
  const formatChanges = useFormatAuditChanges();

  const auditLogQuery = trpc.organization.teamAuditLog.useInfiniteQuery(
    { organizationId: activeOrg?.id ?? "", limit: 20 },
    {
      enabled: Boolean(activeOrg?.id) && isAdmin,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );
  const {
    reload: reloadAuditLog,
    isReloading: isReloadingAuditLog,
    isCoolingDown: isAuditLogReloadCoolingDown,
  } = useReloadCooldown(() => auditLogQuery.refetch());

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Audit Log")}</CardTitle>
          <CardDescription>
            {t("Only team owners and admins can view the audit log.")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const entries = auditLogQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const groups: { day: string; entries: typeof entries }[] = [];
  for (const entry of entries) {
    const day = monthDayYearFormatter.format(new Date(entry.createdAt));
    const lastGroup = groups.at(-1);
    if (lastGroup?.day === day) {
      lastGroup.entries.push(entry);
    } else {
      groups.push({ day, entries: [entry] });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-primary" />
            {t("Audit Log")}
          </CardTitle>
          <CardDescription>
            {t(
              "A detailed history of billing and policy changes made by your team's owners and admins.",
            )}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isReloadingAuditLog || isAuditLogReloadCoolingDown}
          onClick={() => reloadAuditLog()}
        >
          <RefreshCw className={cn("size-3.5", isReloadingAuditLog && "animate-spin")} />
          {t("Reload")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {auditLogQuery.isLoading ? (
          <Spinner />
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("No activity yet.")}</p>
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.day} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground">{group.day}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  {group.entries.map((entry) => {
                    const { icon: Icon } = getActionMeta(entry.action);
                    const targetLabel = entry.targetName || entry.targetEmail || null;
                    const sentence = getActionSentence(entry.action, targetLabel, entry.metadata);
                    const changes = formatChanges(entry.action, entry.metadata);

                    return (
                      <div key={entry.id} className="flex gap-3 rounded-xl border p-3">
                        <Avatar className="size-8 shrink-0">
                          <AvatarImage
                            src={entry.actorImage ?? undefined}
                            alt={entry.actorName || entry.actorEmail}
                          />
                          <AvatarFallback className="text-xs">
                            {getInitials(entry.actorName, entry.actorEmail)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <p className="text-sm">
                              <span className="font-medium">
                                {entry.actorName || entry.actorEmail}
                              </span>{" "}
                              <span className="text-muted-foreground">{sentence}</span>
                            </p>
                            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                              <Icon className="size-3.5" />
                              {dateTimeFormatter.format(new Date(entry.createdAt))}
                            </span>
                          </div>
                          {changes.length > 0 && (
                            <ul className="space-y-1 text-xs">
                              {changes.map((change) => (
                                <li
                                  key={change.field}
                                  className="flex flex-wrap items-center gap-1.5"
                                >
                                  <span className="font-medium text-foreground">
                                    {change.field}
                                  </span>
                                  <span className="text-muted-foreground line-through">
                                    {change.previous}
                                  </span>
                                  <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                                  <span className="font-medium text-foreground">{change.next}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {auditLogQuery.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={auditLogQuery.isFetchingNextPage}
                  onClick={() => auditLogQuery.fetchNextPage()}
                >
                  {auditLogQuery.isFetchingNextPage ? <Spinner className="size-3.5" /> : null}
                  {t("Load more")}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
