"use client";

import { Mail } from "lucide-react";
import { useExtracted } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Invitation } from "./team-types";
import { monthDayFormatter } from "./team-utils";
import { useRoleLabel } from "./use-role-label";

export function TeamPendingInvitations({
  invitations,
  isAdmin,
  onCancel,
}: {
  invitations: Invitation[];
  isAdmin: boolean;
  onCancel: (invitationId: string) => void;
}) {
  const t = useExtracted();
  const roleLabel = useRoleLabel();

  if (invitations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Pending Invitations")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {invitations.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-xl border p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <Mail className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabel(inv.role ?? "member")} · {t("Expires")}{" "}
                    {monthDayFormatter.format(new Date(inv.expiresAt))}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onCancel(inv.id)}
                >
                  {t("Cancel")}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
