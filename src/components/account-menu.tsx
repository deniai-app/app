"use client";

import { LogOut, Settings, UserIcon, Users, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc/react";
import { liveUsageQueryOptions } from "@/lib/usage-query-options";
import { cn } from "@/lib/utils";
import { versions } from "@/lib/version";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

type UsageCategoryItem = {
  category: "basic" | "premium";
  unit: "requests" | "tokens";
  limit: number | null;
  used: number;
  remaining: number | null;
};

function AccountUsageRow({
  label,
  item,
  maxModeEnabled,
}: {
  label: string;
  item: UsageCategoryItem | undefined;
  maxModeEnabled: boolean;
}) {
  const t = useExtracted();
  if (!item) return null;

  const hasLimit = item.limit !== null && item.limit > 0;
  const usedPercent = hasLimit ? Math.min((item.used / (item.limit ?? 1)) * 100, 100) : 0;
  const remainingPercent = Math.max(100 - usedPercent, 0);
  const valueLabel = maxModeEnabled
    ? t("Max Mode")
    : hasLimit
      ? t("{percent}% left", { percent: remainingPercent.toFixed(0) })
      : t("Unlimited");

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={cn(
            "tabular-nums text-foreground/80",
            maxModeEnabled && "text-amber-600 dark:text-amber-400",
          )}
        >
          {valueLabel}
        </span>
      </div>
      {hasLimit && !maxModeEnabled ? (
        <Progress value={usedPercent} className="h-1" />
      ) : (
        <div className="h-1 rounded-full bg-muted" />
      )}
    </div>
  );
}

export function AccountMenu() {
  const t = useExtracted();
  const { push } = useRouter();
  const { isMobile } = useSidebar();
  const utils = trpc.useUtils();
  const session = authClient.useSession();
  const isAnonymous = Boolean(session.data?.user?.isAnonymous);
  const { features } = usePlatformCapabilities();
  const billingDisabled = !features.billing;
  const hasSession = Boolean(session.data?.user);

  const usageQuery = trpc.billing.usage.useQuery(undefined, {
    enabled: hasSession,
    ...liveUsageQueryOptions,
  });

  const maxModeQuery = trpc.billing.maxModeStatus.useQuery(undefined, {
    enabled: !billingDisabled && !isAnonymous,
    staleTime: 60_000,
  });

  const invalidateMaxMode = async () => {
    await Promise.all([utils.billing.maxModeStatus.invalidate(), utils.billing.usage.invalidate()]);
  };

  const enableMaxMode = trpc.billing.enableMaxMode.useMutation({
    onSuccess: async () => {
      toast.success(t("Max Mode enabled."));
      await invalidateMaxMode();
    },
    onError: (error) => toast.error(error.message),
  });

  const disableMaxMode = trpc.billing.disableMaxMode.useMutation({
    onSuccess: async () => {
      toast.success(t("Max Mode disabled."));
      await invalidateMaxMode();
    },
    onError: (error) => toast.error(error.message),
  });

  const maxModePending = enableMaxMode.isPending || disableMaxMode.isPending;
  const maxModeEnabled =
    !billingDisabled && (maxModeQuery.data?.enabled ?? usageQuery.data?.maxModeEnabled ?? false);
  const maxModeEligible =
    !billingDisabled && (maxModeQuery.data?.eligible ?? usageQuery.data?.maxModeEligible ?? false);

  const basicUsage = usageQuery.data?.usage.find((entry) => entry.category === "basic");
  const premiumUsage = usageQuery.data?.usage.find((entry) => entry.category === "premium");
  const usageTier = usageQuery.data?.tier ?? "free";
  const usageTierLabel =
    usageTier === "free"
      ? t("Free")
      : usageTier === "plus"
        ? t("Plus")
        : usageTier === "max"
          ? t("Max")
          : t("Pro");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton className="h-auto py-2" />}>
        <div className="flex w-full items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground overflow-hidden">
            {session.data?.user?.image ? (
              <Image
                src={session.data.user.image}
                alt={session.data.user.name ?? t("User")}
                className="size-full object-cover"
                width={32}
                height={32}
                sizes="32px"
                unoptimized
              />
            ) : (
              (session.data?.user?.name?.charAt(0).toUpperCase() ?? "U")
            )}
          </div>
          <span className="flex-1 truncate text-sm">{session.data?.user?.name ?? t("User")}</span>
          {maxModeEnabled && (
            <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground/50">
              <Zap className="size-2.5" />
              Max
            </span>
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? "top" : "right"} align="start" className="w-64">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground overflow-hidden text-xs">
            {session.data?.user?.image ? (
              <Image
                src={session.data.user.image}
                alt={session.data.user.name ?? t("User")}
                className="size-full object-cover"
                width={24}
                height={24}
                sizes="24px"
                unoptimized
              />
            ) : (
              (session.data?.user?.name?.charAt(0).toUpperCase() ?? "U")
            )}
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <span className="flex-1 truncate text-sm font-medium">
              {session.data?.user?.name ?? t("User")}
            </span>
            <span className="flex-1 truncate text-sm">
              {session.data?.user?.email ?? t("User")}
            </span>
          </div>
        </div>

        {hasSession && (
          <>
            <DropdownMenuSeparator />
            <div className="space-y-2.5 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{t("Usage")}</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {usageTierLabel}
                </span>
              </div>
              {usageQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">{t("Loading usage…")}</p>
              ) : usageQuery.isError ? (
                <p className="text-xs text-destructive">{t("Failed to load usage.")}</p>
              ) : (
                <div className="space-y-2.5">
                  <AccountUsageRow
                    label={t("Basic")}
                    item={basicUsage}
                    maxModeEnabled={maxModeEnabled}
                  />
                  <AccountUsageRow
                    label={t("Premium")}
                    item={premiumUsage}
                    maxModeEnabled={maxModeEnabled}
                  />
                </div>
              )}
              {!isAnonymous && !billingDisabled && (
                <Link
                  href="/settings/billing"
                  className="block text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {t("View billing")}
                </Link>
              )}
            </div>
          </>
        )}

        {(maxModeEnabled || maxModeEligible) && (
          <>
            <DropdownMenuSeparator />
            {maxModeEnabled && (
              <DropdownMenuItem
                className="gap-2 text-sm text-muted-foreground"
                closeOnClick={false}
                disabled={maxModePending}
                onClick={() => {
                  if (maxModePending) return;
                  disableMaxMode.mutate();
                }}
              >
                <Zap className="size-4 text-amber-500" />
                <span className="flex-1">
                  {disableMaxMode.isPending ? t("Disabling…") : t("Disable Max Mode")}
                </span>
              </DropdownMenuItem>
            )}
            {!maxModeEnabled && maxModeEligible && (
              <DropdownMenuItem
                className="gap-2 text-sm text-amber-600"
                closeOnClick={false}
                disabled={maxModePending}
                onClick={() => {
                  if (maxModePending) return;
                  enableMaxMode.mutate();
                }}
              >
                <Zap className="size-4" />
                <span className="flex-1">
                  {enableMaxMode.isPending ? t("Enabling…") : t("Enable Max Mode")}
                </span>
              </DropdownMenuItem>
            )}
          </>
        )}

        {
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={<div className="px-2 py-1.5 text-xs text-muted-foreground cursor-help" />}
              >
                <span className="block">Deni AI {versions.version}</span>
              </TooltipTrigger>
              <TooltipContent side="left" align="start">
                <div>
                  {versions.codename}, {versions.date}
                </div>
                <div className="font-mono text-[10px]">{versions.hash}</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
        <DropdownMenuItem
          className="gap-2 text-sm"
          render={<Link href="/account/settings" className="flex w-full" />}
        >
          <UserIcon className="size-4" />
          <span className="flex-1">{t("Account")}</span>
        </DropdownMenuItem>
        {!isAnonymous && (
          <DropdownMenuItem
            className="gap-2 text-sm"
            render={<Link href="/settings/appearance" className="flex w-full" />}
          >
            <Settings className="size-4" />
            <span className="flex-1">{t("Settings")}</span>
          </DropdownMenuItem>
        )}
        {!isAnonymous && !billingDisabled && (
          <DropdownMenuItem
            className="gap-2 text-sm"
            render={<Link href="/settings/team" className="flex w-full" />}
          >
            <Users className="size-4" />
            <span className="flex-1">{t("Team")}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-sm"
          onClick={() => {
            authClient.signOut();
            push("/");
          }}
        >
          <LogOut className="size-4" />
          <span>{t("Logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
