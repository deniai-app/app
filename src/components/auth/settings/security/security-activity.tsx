"use client";

import Bowser from "bowser";
import { History, Monitor, Smartphone } from "lucide-react";
import { useExtracted, useLocale } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatAppDate } from "@/lib/format-date";
import { trpc } from "@/lib/trpc/react";

export function SecurityActivity() {
  const t = useExtracted();
  const locale = useLocale();
  const activityQuery = trpc.account.securityActivity.useQuery({ limit: 30 });
  const items = activityQuery.data?.items ?? [];
  const actionLabels: Record<string, string> = {
    signed_in: t("Signed in"),
    signed_out: t("Signed out"),
    password_changed: t("Password changed"),
    email_change_requested: t("Email change requested"),
    email_changed: t("Email changed"),
    two_factor_enabled: t("Two-factor authentication enabled"),
    two_factor_disabled: t("Two-factor authentication disabled"),
    passkey_added: t("Passkey added"),
    passkey_removed: t("Passkey removed"),
    session_revoked: t("Session revoked"),
    account_linked: t("Account linked"),
    account_unlinked: t("Account unlinked"),
    data_exported: t("Account data exported"),
  };

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <History className="size-4" />
        {t("Sign-in history")}
      </h2>
      <Card className="p-0">
        <CardContent className="p-0">
          {activityQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              {t("No sign-in or security events recorded yet.")}
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const ua = Bowser.parse(item.userAgent || "");
                const isMobile = ua.platform.type === "mobile" || ua.platform.type === "tablet";
                const browser = ua.browser.name || t("Unknown browser");
                const os = ua.os.name || t("Unknown OS");
                return (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      {isMobile ? (
                        <Smartphone className="size-4" />
                      ) : (
                        <Monitor className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {actionLabels[item.action] ?? item.action}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {browser} · {os}
                        {item.ipAddress ? ` · ${item.ipAddress}` : ""}
                      </p>
                    </div>
                    <time
                      className="shrink-0 text-xs text-muted-foreground"
                      dateTime={item.createdAt.toISOString()}
                    >
                      {formatAppDate(item.createdAt, locale, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
