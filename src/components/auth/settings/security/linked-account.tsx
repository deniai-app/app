"use client";

import { getProviderName, type AuthSocialProvider } from "@better-auth-ui/core";
import {
  renderProviderIcon,
  useAccountInfo,
  useAuth,
  useLinkSocial,
  useUnlinkAccount,
} from "@better-auth-ui/react";
import type { Account } from "better-auth";
import { Link2, Link2Off, Plug } from "lucide-react";
import { useExtracted } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useFreshSessionGuard } from "@/hooks/use-fresh-session-guard";
import { cn } from "@/lib/utils";
import { FreshSessionDialog } from "./fresh-session-dialog";

export type LinkedAccountProps = {
  account?: Account;
  provider: AuthSocialProvider | string;
};

/**
 * Render a single linked social account row with provider info and link/unlink control.
 *
 * Fetches additional account information from the provider using the accountInfo API
 * and displays the provider name, account details, and a link/unlink button.
 *
 * @param account - The account object containing id, accountId, and providerId
 * @param provider - The provider id
 * @returns A JSX element containing the linked account row
 */
export function LinkedAccount({ account, provider }: LinkedAccountProps) {
  const t = useExtracted();
  const { authClient, baseURL, localization } = useAuth();

  const { data: accountInfo, isPending: isLoadingInfo } = useAccountInfo(authClient, {
    // better-auth's `/account-info` resolves accounts by the internal Better
    // Auth account row id (`account.id`), not the provider's own account id
    // (`account.accountId`, e.g. a Google user's numeric sub) — passing the
    // latter causes a spurious ACCOUNT_NOT_FOUND.
    query: account ? { accountId: account.id } : { useAccountCookie: true },
    enabled: !!account,
  });

  const { mutate: linkSocial, isPending: isLinking } = useLinkSocial(authClient);

  const { open, setOpen, guard, handleVerified } = useFreshSessionGuard();

  const { mutate: unlinkAccount, isPending: isUnlinking } = useUnlinkAccount(authClient, {
    onSuccess: () => toast.success(localization.settings.accountUnlinked),
    onError: (error) => {
      if (!account) return;
      guard(error, () => unlinkAccount({ accountId: account.id }));
    },
  });

  const providerName = getProviderName(provider);
  const providerIcon = renderProviderIcon(provider, {
    className: cn("size-4.5", !account && "opacity-50"),
  });
  const accountData = accountInfo?.data as { login?: unknown; username?: unknown } | undefined;

  const displayName =
    (typeof accountData?.login === "string" ? accountData.login : undefined) ||
    (typeof accountData?.username === "string" ? accountData.username : undefined) ||
    accountInfo?.user?.email ||
    accountInfo?.user?.name ||
    account?.accountId;

  return (
    <Card className="bg-transparent border-0 ring-0 shadow-none">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          {providerIcon ? (
            providerIcon
          ) : (
            <Plug className={cn("size-4.5", !account && "opacity-50")} />
          )}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-tight">{providerName}</span>

          {account && isLoadingInfo ? (
            <Skeleton className="my-0.5 h-3 w-24" />
          ) : (
            <span className="text-xs text-muted-foreground truncate">
              {account
                ? displayName
                : localization.settings.linkProvider.replace("{{provider}}", providerName)}
            </span>
          )}
        </div>

        {account ? (
          <Button
            className="ml-auto shrink-0"
            variant="outline"
            size="sm"
            onClick={() => unlinkAccount({ accountId: account.id })}
            disabled={isUnlinking}
            aria-label={localization.settings.unlinkProvider.replace("{{provider}}", providerName)}
          >
            {isUnlinking ? <Spinner /> : <Link2Off />}
            {t("Unlink")}
          </Button>
        ) : (
          <Button
            className="ml-auto shrink-0"
            variant="outline"
            size="sm"
            onClick={() =>
              linkSocial({
                provider,
                callbackURL: `${baseURL}${window.location.pathname}`,
              })
            }
            disabled={isLinking}
            aria-label={localization.settings.linkProvider.replace("{{provider}}", providerName)}
          >
            {isLinking ? <Spinner /> : <Link2 />}
            {localization.settings.link}
          </Button>
        )}
      </CardContent>

      <FreshSessionDialog open={open} onOpenChange={setOpen} onVerified={handleVerified} />
    </Card>
  );
}
