"use client";

import {
  Check,
  Crown,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useExtracted } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Member } from "./team-types";
import { useRoleLabel } from "./use-role-label";

export function TeamMembersList({
  members,
  isAdmin,
  updatingMemberRoleId,
  onInviteClick,
  onRemoveClick,
  onRoleChange,
  onReload,
  isReloading,
  isReloadDisabled,
}: {
  members: Member[];
  isAdmin: boolean;
  updatingMemberRoleId: string | null;
  onInviteClick: () => void;
  onRemoveClick: (member: Member) => void;
  onRoleChange: (member: Member, role: "admin" | "member") => void;
  onReload: () => void;
  isReloading: boolean;
  isReloadDisabled: boolean;
}) {
  const t = useExtracted();
  const roleLabel = useRoleLabel();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{t("Members")}</CardTitle>
          <CardDescription>{t("People in your team.")}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isReloadDisabled}
            onClick={onReload}
            aria-label={t("Reload")}
          >
            {isReloadDisabled && !isReloading ? (
              <Check className="size-3.5" />
            ) : (
              <RefreshCw className={cn("size-3.5", isReloading && "animate-spin")} />
            )}
            {t("Reload")}
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={onInviteClick}>
              <UserPlus className="size-3.5" />
              {t("Invite")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-full border p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
                  {m.user.name?.charAt(0) ?? m.user.email?.charAt(0) ?? "?"}
                </div>
                <div>
                  <p className="text-sm font-medium">{m.user.name || m.user.email}</p>
                  {m.user.name && <p className="text-xs text-muted-foreground">{m.user.email}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === "owner" ? "default" : "secondary"} className="text-xs">
                  {m.role === "owner" && <Crown className="mr-1 size-3" />}
                  {roleLabel(m.role)}
                </Badge>
                {isAdmin && m.role !== "owner" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={updatingMemberRoleId === m.id}
                        />
                      }
                    >
                      {updatingMemberRoleId === m.id ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <MoreHorizontal className="size-4" />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {m.role !== "admin" && (
                        <DropdownMenuItem onClick={() => onRoleChange(m, "admin")}>
                          <ShieldCheck className="size-4" />
                          {t("Make {role}", { role: roleLabel("admin") })}
                        </DropdownMenuItem>
                      )}
                      {m.role !== "member" && (
                        <DropdownMenuItem onClick={() => onRoleChange(m, "member")}>
                          <UserRound className="size-4" />
                          {t("Make {role}", { role: roleLabel("member") })}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() =>
                          onRemoveClick({
                            ...m,
                            user: {
                              ...m.user,
                              image: m.user.image ?? null,
                            },
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                        {t("Remove")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
