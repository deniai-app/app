"use client";

import { Check, ChevronsUpDown, Plus, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TeamCreateDialog } from "./team-create-dialog";
import type { Organization, ReceivedInvitation } from "./team-types";

export function TeamSwitcher({
  organizations,
  activeOrg,
  onSelect,
  pendingInvitations,
  isCreateDialogOpen,
  onCreateDialogOpenChange,
  newOrgName,
  onNewOrgNameChange,
  onCreate,
  isCreating,
}: {
  organizations: Organization[];
  activeOrg: Organization | null;
  onSelect: (org: Organization) => void;
  pendingInvitations: ReceivedInvitation[];
  isCreateDialogOpen: boolean;
  onCreateDialogOpenChange: (open: boolean) => void;
  newOrgName: string;
  onNewOrgNameChange: (value: string) => void;
  onCreate: () => void;
  isCreating: boolean;
}) {
  const t = useExtracted();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" className="w-full justify-between gap-2 px-2.5 py-5" />}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-xs font-semibold uppercase text-primary">
              {activeOrg?.logo ? (
                <Image
                  src={activeOrg.logo}
                  alt=""
                  className="size-full object-cover"
                  width={24}
                  height={24}
                  sizes="24px"
                  unoptimized
                />
              ) : activeOrg?.name ? (
                activeOrg.name.charAt(0)
              ) : (
                <Users className="size-3.5" />
              )}
            </span>
            <span className="truncate text-sm font-medium">
              {activeOrg?.name ?? t("Select team")}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("Teams")}</DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem key={org.id} className="gap-2 py-2" onClick={() => onSelect(org)}>
                <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-[10px] font-semibold uppercase">
                  {org.logo ? (
                    <Image
                      src={org.logo}
                      alt=""
                      className="size-full object-cover"
                      width={20}
                      height={20}
                      sizes="20px"
                      unoptimized
                    />
                  ) : (
                    org.name.charAt(0)
                  )}
                </span>
                <span className="flex-1 truncate">{org.name}</span>
                {activeOrg?.id === org.id && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {pendingInvitations.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("Invitations")}</DropdownMenuLabel>
                {pendingInvitations.map((inv) => (
                  <DropdownMenuItem
                    key={inv.id}
                    className="gap-2 py-2"
                    render={<Link href="/settings/team" />}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold uppercase">
                      {inv.organizationName.charAt(0)}
                    </span>
                    <span className="flex-1 truncate">{inv.organizationName}</span>
                    <span className="text-[10px] text-muted-foreground">{t("(pending)")}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onClick={() => onCreateDialogOpenChange(true)}>
            <Plus className="size-3.5" />
            {t("New Team")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TeamCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={onCreateDialogOpenChange}
        name={newOrgName}
        onNameChange={onNewOrgNameChange}
        onCreate={onCreate}
        isCreating={isCreating}
      />
    </>
  );
}
