"use client";

import { authQueryKeys } from "@better-auth-ui/core";
import { useAuth, useAuthPlugin, useDeleteUser, useListAccounts } from "@better-auth-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { type SyntheticEvent, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { deleteUserPlugin } from "@/lib/auth/delete-user-plugin";
import { trpc } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

export type DeleteAccountProps = {
  className?: string;
};

/**
 * Danger-zone card to delete the authenticated account, with a confirmation dialog and toasts.
 */
export function DeleteAccount({ className }: DeleteAccountProps) {
  const { authClient, basePaths, localization, viewPaths, navigate } = useAuth();
  const t = useExtracted();

  const { localization: deleteUserLocalization, sendDeleteAccountVerification } =
    useAuthPlugin(deleteUserPlugin);

  const { data: accounts } = useListAccounts(authClient);

  const queryClient = useQueryClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const deletionStatus = trpc.billing.accountDeletionStatus.useQuery(undefined, {
    enabled: confirmOpen,
    refetchOnMount: "always",
  });

  const hasCredentialAccount = accounts?.some((account) => account.providerId === "credential");
  const needsPassword = !sendDeleteAccountVerification && hasCredentialAccount;

  const { mutate: deleteUser, isPending } = useDeleteUser(authClient);

  const handleDialogOpenChange = (open: boolean) => {
    setConfirmOpen(open);
    setPassword("");
  };

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const latest = await deletionStatus.refetch();
      if (latest.error || !latest.data) {
        toast.error(t("Unable to check your subscription. Please try again."));
        return;
      }
      if (latest.data.state === "active" || latest.data.state === "teamOwner") return;
    } catch {
      toast.error(t("Unable to check your subscription. Please try again."));
      return;
    }

    const params = needsPassword ? { password } : {};

    deleteUser(params, {
      onError: (error) => {
        toast.error(error.message);
        void deletionStatus.refetch();
      },
      onSuccess: () => {
        setConfirmOpen(false);
        setPassword("");

        if (sendDeleteAccountVerification) {
          toast.success(deleteUserLocalization.deleteUserVerificationSent);
        } else {
          toast.success(deleteUserLocalization.deleteUserSuccess);
          queryClient.removeQueries({ queryKey: authQueryKeys.all });
          navigate({
            to: `${basePaths.auth}/${viewPaths.auth.signIn}`,
            replace: true,
          });
        }
      },
    });
  };

  return (
    <Card className={cn("border-destructive", className)}>
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium leading-tight">
            {deleteUserLocalization.deleteAccount}
          </p>

          <p className="text-muted-foreground text-xs mt-0.5">
            {deleteUserLocalization.deleteAccountDescription}
          </p>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={handleDialogOpenChange}>
          <AlertDialogTrigger
            className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
            disabled={!accounts}
          >
            {deleteUserLocalization.deleteAccount}
          </AlertDialogTrigger>

          <AlertDialogContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                  <TriangleAlert />
                </AlertDialogMedia>

                <AlertDialogTitle>{deleteUserLocalization.deleteAccount}</AlertDialogTitle>

                <AlertDialogDescription>
                  {deletionStatus.isPending
                    ? t("Checking your subscription…")
                    : deletionStatus.isError
                      ? t("Unable to check your subscription. Please try again.")
                      : deletionStatus.data?.state === "teamOwner"
                        ? t(
                            "You own a team. Delete the team or transfer ownership before deleting your account.",
                          )
                        : deletionStatus.data?.state === "active"
                          ? t(
                              "You have an active subscription. Cancel it before deleting your account.",
                            )
                          : deletionStatus.data?.state === "cancelPending"
                            ? t(
                                "Your subscription is set to end. Wait until it ends and return to delete your account, or delete now without a refund. Deleting now ends your remaining access immediately. Your account will not be deleted automatically.",
                              )
                            : deleteUserLocalization.deleteAccountDescription}
                </AlertDialogDescription>
                {deletionStatus.data?.state === "teamOwner" && (
                  <Link href="/settings/team" className="text-sm underline underline-offset-4">
                    {t("Manage team")}
                  </Link>
                )}
                {deletionStatus.data?.state === "active" && (
                  <Link href="/settings/billing" className="text-sm underline underline-offset-4">
                    {t("Manage subscription")}
                  </Link>
                )}
              </AlertDialogHeader>

              {needsPassword && deletionStatus.data?.state !== "teamOwner" && (
                <Field>
                  <Label htmlFor="delete-password">{localization.auth.password}</Label>

                  <Input
                    id="delete-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder={localization.auth.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isPending}
                    required
                  />

                  <FieldError />
                </Field>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  {deletionStatus.data?.state === "cancelPending"
                    ? t("Wait until the subscription ends")
                    : localization.settings.cancel}
                </AlertDialogCancel>

                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    isPending ||
                    deletionStatus.isFetching ||
                    !deletionStatus.data ||
                    deletionStatus.data.state === "active" ||
                    deletionStatus.data.state === "teamOwner"
                  }
                >
                  {isPending && <Spinner />}
                  {deletionStatus.data?.state === "cancelPending"
                    ? t("Delete now without a refund")
                    : deleteUserLocalization.deleteAccount}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
