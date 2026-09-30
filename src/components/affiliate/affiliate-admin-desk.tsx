"use client";

import { Check, Mail, Send, ShieldCheck, X } from "lucide-react";
import { useExtracted } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAppDate } from "@/lib/format-date";

type AdminRewardRow = {
  reward: {
    id: string;
    type: string;
    createdAt: Date | string;
    riskScore: number | null;
    riskFlags: unknown;
  };
  referrer: {
    name: string | null;
    email: string;
  };
  referredUser: { email: string } | null;
};

function getRiskFlags(riskFlags: unknown): string[] {
  if (!Array.isArray(riskFlags)) {
    return [];
  }
  return riskFlags.filter((flag): flag is string => typeof flag === "string");
}

function getRiskLevel(score: number): "low" | "medium" | "high" {
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

type CouponDraft = { code: string; note: string };

export function AffiliateAdminDesk({
  locale,
  errorMessage,
  rows,
  getDraft,
  updateDraft,
  pending,
  onApprove,
  onReject,
  onSend,
}: {
  locale: string;
  errorMessage: string | null;
  rows: AdminRewardRow[] | undefined;
  getDraft: (rewardId: string) => CouponDraft;
  updateDraft: (rewardId: string, field: "code" | "note", value: string) => void;
  pending: {
    load: boolean;
    approveRewardId: string | null;
    rejectRewardId: string | null;
    sendRewardId: string | null;
  };
  onApprove: (rewardId: string) => void;
  onReject: (rewardId: string) => void;
  onSend: (input: { rewardId: string; couponCode: string; note?: string }) => void;
}) {
  const t = useExtracted();

  return (
    <Card className="border-chart-2/35 bg-chart-2/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          <CardTitle>{t("Reward desk")}</CardTitle>
        </div>
        <CardDescription>
          {t("Approve milestone resets and send earned coupon rewards from one place.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {pending.load ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>{t("Unable to load admin queue")}</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : rows?.length ? (
          <div className="space-y-3">
            {rows.map((row) => {
              const draft = getDraft(row.reward.id);
              const isResetReward = row.reward.type === "registration_reset";
              const isDiscountCouponReward = row.reward.type === "discount_coupon";
              const isApproving = pending.approveRewardId === row.reward.id;
              const isRejecting = pending.rejectRewardId === row.reward.id;
              const isSending = pending.sendRewardId === row.reward.id;
              const riskFlags = getRiskFlags(row.reward.riskFlags);
              const riskLevel =
                isResetReward && row.reward.riskScore !== null
                  ? getRiskLevel(row.reward.riskScore)
                  : null;
              return (
                <div key={row.reward.id} className="rounded-2xl border bg-background/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isResetReward ? "secondary" : "outline"}>
                          {isResetReward
                            ? t("Approval")
                            : isDiscountCouponReward
                              ? t("30% OFF coupon")
                              : t("Coupon email")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatAppDate(row.reward.createdAt, locale)}
                        </span>
                        {riskLevel ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Badge
                                  variant={riskLevel === "low" ? "outline" : "destructive"}
                                  className={
                                    riskLevel === "medium"
                                      ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                      : undefined
                                  }
                                />
                              }
                            >
                              {riskLevel === "high"
                                ? t("High risk")
                                : riskLevel === "medium"
                                  ? t("Medium risk")
                                  : t("Low risk")}
                              {typeof row.reward.riskScore === "number"
                                ? ` (${row.reward.riskScore})`
                                : null}
                            </TooltipTrigger>
                            <TooltipContent>
                              {riskFlags.length > 0 ? (
                                <p>{riskFlags.join(", ")}</p>
                              ) : (
                                <p>{t("No fraud signals detected.")}</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                      <div className="text-sm font-medium">
                        {row.referrer.name || t("Unnamed member")}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.referrer.email}
                      </div>
                      {row.referredUser ? (
                        <div className="pt-1 text-xs text-muted-foreground">
                          {t("Referred user: {email}", { email: row.referredUser.email })}
                        </div>
                      ) : null}
                    </div>
                    {isResetReward ? (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          disabled={isApproving || isRejecting}
                          onClick={() => onApprove(row.reward.id)}
                        >
                          {isApproving ? <Spinner /> : <Check className="size-3.5" />}
                          {t("Approve")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isApproving || isRejecting}
                          onClick={() => onReject(row.reward.id)}
                        >
                          {isRejecting ? <Spinner /> : <X className="size-3.5" />}
                          {t("Reject")}
                        </Button>
                      </div>
                    ) : (
                      <div className="w-full space-y-2 sm:max-w-md">
                        <div className="flex gap-2">
                          <Input
                            value={draft.code}
                            onChange={(event) =>
                              updateDraft(row.reward.id, "code", event.target.value)
                            }
                            placeholder={
                              isDiscountCouponReward
                                ? t("30% OFF Stripe coupon or promotion code")
                                : t("Stripe coupon or promotion code")
                            }
                            aria-label={t("Coupon code")}
                            className="font-mono"
                          />
                          <Button
                            size="sm"
                            disabled={isSending || draft.code.trim().length === 0}
                            onClick={() =>
                              onSend({
                                rewardId: row.reward.id,
                                couponCode: draft.code,
                                note: draft.note || undefined,
                              })
                            }
                          >
                            {isSending ? <Spinner /> : <Send className="size-3.5" />}
                            {t("Send")}
                          </Button>
                        </div>
                        <Textarea
                          value={draft.note}
                          onChange={(event) =>
                            updateDraft(row.reward.id, "note", event.target.value)
                          }
                          placeholder={t("Optional note for the email")}
                          aria-label={t("Optional note for the email")}
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
            <Mail className="mr-2 size-4" />
            {t("The admin queue is clear.")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
