"use client";

import { Mail } from "lucide-react";
import { useExtracted } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { ReceivedInvitation } from "./team-types";
import { useRoleLabel } from "./use-role-label";

export function TeamReceivedInvitations({
  invitations,
  respondingInvitationId,
  onAccept,
  onReject,
}: {
  invitations: ReceivedInvitation[];
  respondingInvitationId: string | null;
  onAccept: (invitationId: string) => void;
  onReject: (invitationId: string) => void;
}) {
  const t = useExtracted();
  const roleLabel = useRoleLabel();

  if (invitations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Invitations for you")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {invitations.map((inv) => {
            const isResponding = respondingInvitationId === inv.id;
            return (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                    <Mail className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{inv.organizationName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Invited you to join as {role}", {
                        role: roleLabel(inv.role ?? "member"),
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isResponding}
                    onClick={() => onReject(inv.id)}
                  >
                    {t("Decline")}
                  </Button>
                  <Button size="sm" disabled={isResponding} onClick={() => onAccept(inv.id)}>
                    {isResponding && <Spinner className="size-3.5" />}
                    {t("Accept")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
