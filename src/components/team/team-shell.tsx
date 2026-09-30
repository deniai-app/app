"use client";

import { CreditCard, FolderKanban, History, Home, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useExtracted } from "next-intl";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTeamSettingsContext } from "./team-settings-context";
import { TeamSwitcher } from "./team-switcher";

export function TeamShell({ children }: { children: ReactNode }) {
  const t = useExtracted();
  const pathname = usePathname();
  const { features } = usePlatformCapabilities();
  const {
    organizations,
    activeOrg,
    selectOrg,
    isAdmin,
    myPendingInvitations,
    isCreateDialogOpen,
    setIsCreateDialogOpen,
    newOrgName,
    setNewOrgName,
    handleCreateOrg,
    isCreatingOrg,
  } = useTeamSettingsContext();

  const navItems = [
    { href: "/settings/team", label: t("Home"), icon: Home, exact: true },
    { href: "/settings/team/members", label: t("Members"), icon: Users, exact: false },
    { href: "/settings/projects", label: t("Projects"), icon: FolderKanban, exact: false },
    ...(isAdmin && features.billing
      ? [
          { href: "/settings/team/billing", label: t("Billing"), icon: CreditCard, exact: false },
          {
            href: "/settings/team/audit-log",
            label: t("Audit Log"),
            icon: History,
            exact: false,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-56">
        <TeamSwitcher
          organizations={organizations}
          activeOrg={activeOrg}
          onSelect={(org) => selectOrg(org)}
          pendingInvitations={myPendingInvitations}
          isCreateDialogOpen={isCreateDialogOpen}
          onCreateDialogOpenChange={setIsCreateDialogOpen}
          newOrgName={newOrgName}
          onNewOrgNameChange={setNewOrgName}
          onCreate={handleCreateOrg}
          isCreating={isCreatingOrg}
        />
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-muted hover:text-foreground",
                  isActive && "bg-muted text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
