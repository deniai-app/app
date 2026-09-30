"use client";

import { useExtracted } from "next-intl";
import type { ClientPlan, IndividualPlanId } from "@/lib/billing";
import { useFormatCurrencyMinor, usePlanIntervalLabel } from "./billing-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Spinner } from "../ui/spinner";

export function BillingChangePlanDialog({
  open,
  onOpenChange,
  changeTarget,
  estimate,
  hasAgreed,
  onHasAgreedChange,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeTarget: ClientPlan | null;
  estimate: {
    error: { message: string } | null;
    data?: { amountDue?: number; currency?: string | null } | null;
  };
  hasAgreed: boolean;
  onHasAgreedChange: (value: boolean) => void;
  isPending: boolean;
  onConfirm: (planId: IndividualPlanId) => void;
}) {
  const t = useExtracted();
  const getPlanIntervalLabel = usePlanIntervalLabel();
  const formatCurrencyMinor = useFormatCurrencyMinor();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Change plan?")}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            <p>
              {t("You will switch to {plan}. Prorations apply.", {
                plan: changeTarget ? getPlanIntervalLabel(changeTarget.id) : "",
              })}
            </p>
            {estimate.error ? (
              <span className="block mt-2">{t("Unable to fetch estimate.")}</span>
            ) : (
              <span className="block mt-2">
                {t("Estimated charge: {amount}", {
                  amount: formatCurrencyMinor(
                    estimate.data?.amountDue ?? 0,
                    estimate.data?.currency,
                  ),
                })}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-start gap-x-2 py-4">
          <Checkbox
            id="agree-plan-change"
            checked={hasAgreed}
            onCheckedChange={(checked) => onHasAgreedChange(checked === true)}
            disabled={estimate.error != null}
          />
          <Label htmlFor="agree-plan-change" className="text-sm leading-tight cursor-pointer">
            {t("I have reviewed the estimated charge and agree to the plan change.")}
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || !changeTarget || estimate.error != null || !hasAgreed}
            onClick={() => {
              if (!changeTarget) return;
              onConfirm(changeTarget.id as IndividualPlanId);
            }}
          >
            {isPending && <Spinner />}
            {t("Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
