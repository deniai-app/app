"use client";

import { Gift, RotateCcw } from "lucide-react";
import { useExtracted } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { AffiliateResetPlanTier } from "@/lib/affiliate-types";
import { trpc } from "@/lib/trpc/react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Spinner } from "../ui/spinner";
import { Separator } from "../ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const resetTargetTypes = ["all", "plan", "user"] as const;
type ResetTargetType = (typeof resetTargetTypes)[number];

export function BillingResetCard() {
  const t = useExtracted();
  const utils = trpc.useUtils();
  const [targetType, setTargetType] = useState<ResetTargetType>("all");
  const [planTier, setPlanTier] = useState<AffiliateResetPlanTier>("plus");
  const [userIdentifier, setUserIdentifier] = useState("");
  const [quantity, setQuantity] = useState("1");

  const statusQuery = trpc.affiliate.status.useQuery(undefined, {
    staleTime: 30_000,
  });

  const invalidateResetData = async () => {
    await Promise.all([
      utils.affiliate.status.invalidate(),
      utils.billing.usage.invalidate(),
      utils.billing.status.invalidate(),
      utils.billing.maxModeStatus.invalidate(),
    ]);
  };

  const consumeResetCredit = trpc.affiliate.consumeResetCredit.useMutation({
    onSuccess: async ({ remaining }) => {
      toast.success(t("Rate limits reset."));
      await invalidateResetData();
      if (remaining === 0) {
        toast.info(t("You have used your last reset credit."));
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const grantResetCredits = trpc.affiliate.adminGrantResetCredits.useMutation({
    onSuccess: async ({ grantedUsers, quantity: grantedQuantity }) => {
      toast.success(
        t("Granted {quantity} reset credits to {count} users.", {
          quantity: String(grantedQuantity),
          count: String(grantedUsers),
        }),
      );
      await invalidateResetData();
    },
    onError: (error) => toast.error(error.message),
  });

  if (statusQuery.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Usage reset credits")}</CardTitle>
          <CardDescription className="text-destructive">
            {statusQuery.error.message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (statusQuery.isLoading || !statusQuery.data) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  const status = statusQuery.data;
  const isBusy = consumeResetCredit.isPending || grantResetCredits.isPending;

  const handleGrant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 100) {
      toast.error(t("Enter a quantity from 1 to 100."));
      return;
    }

    if (targetType === "user" && !userIdentifier.trim()) {
      toast.error(t("Enter an email address or user ID."));
      return;
    }

    grantResetCredits.mutate({
      quantity: parsedQuantity,
      target:
        targetType === "all"
          ? { type: "all" }
          : targetType === "plan"
            ? { type: "plan", planTier }
            : { type: "user", identifier: userIdentifier.trim() },
    });
  };

  return (
    <Card>
      <CardHeader className="gap-0!">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <RotateCcw className="size-4" />
              {t("Usage reset credits")}
            </CardTitle>
            <CardDescription className="mt-1">
              {t("Affiliate reset credits can clear your basic and premium usage immediately.")}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {status.resetCredits}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">
              {t("{count} reset credits available", { count: String(status.resetCredits) })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Use one credit to reset your current usage limits.")}
            </p>
          </div>
          <Button
            disabled={status.resetCredits < 1 || isBusy}
            onClick={() => consumeResetCredit.mutate()}
          >
            {consumeResetCredit.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RotateCcw data-icon="inline-start" />
            )}
            {t("Reset limits now")}
          </Button>
        </div>

        {status.isAdmin && (
          <>
            <Separator />
            <div className="space-y-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Gift className="size-4" />
                  {t("Admin reset credits")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Grant reset credits to all users, a plan, or one specific user.")}
                </p>
              </div>

              <form onSubmit={handleGrant}>
                <FieldGroup className="gap-4">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                    <Field>
                      <FieldLabel htmlFor="reset-target-type">{t("Recipients")}</FieldLabel>
                      <Select
                        value={targetType}
                        onValueChange={(value) => setTargetType(value as ResetTargetType)}
                      >
                        <SelectTrigger id="reset-target-type" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="all">{t("All users")}</SelectItem>
                            <SelectItem value="plan">{t("Users on a plan")}</SelectItem>
                            <SelectItem value="user">{t("Specific user")}</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="reset-credit-quantity">
                        {t("Credits per user")}
                      </FieldLabel>
                      <Input
                        id="reset-credit-quantity"
                        type="number"
                        min={1}
                        max={100}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                      />
                    </Field>
                  </div>

                  {targetType === "plan" && (
                    <Field>
                      <FieldLabel htmlFor="reset-plan-tier">{t("Plan")}</FieldLabel>
                      <Select
                        value={planTier}
                        onValueChange={(value) => setPlanTier(value as AffiliateResetPlanTier)}
                      >
                        <SelectTrigger id="reset-plan-tier" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="free">{t("Free plan")}</SelectItem>
                            <SelectItem value="plus">{t("Plus plan")}</SelectItem>
                            <SelectItem value="pro">{t("Pro plan")}</SelectItem>
                            <SelectItem value="max">{t("Max plan")}</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        {t(
                          "Paid plans include active subscriptions and their current grace period.",
                        )}
                      </FieldDescription>
                    </Field>
                  )}

                  {targetType === "user" && (
                    <Field>
                      <FieldLabel htmlFor="reset-user-identifier">
                        {t("User email or ID")}
                      </FieldLabel>
                      <Input
                        id="reset-user-identifier"
                        value={userIdentifier}
                        onChange={(event) => setUserIdentifier(event.target.value)}
                        placeholder={t("name@example.com or user ID")}
                        autoComplete="off"
                      />
                    </Field>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "The selected users receive credits; their usage is not reset until a credit is used.",
                      )}
                    </p>
                    <Button type="submit" disabled={isBusy}>
                      {grantResetCredits.isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <Gift data-icon="inline-start" />
                      )}
                      {t("Grant reset credits")}
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
