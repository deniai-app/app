"use client";

import { Percent, RotateCcw, Users } from "lucide-react";
import { useExtracted } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAppDate } from "@/lib/format-date";

type ReferralRow = {
  id: string;
  referredName: string | null;
  registeredAt: Date | string | null;
  purchasePlanId: string | null;
  purchaseDeadlineAt: Date | string | null;
};

const RECENT_REFERRAL_LIMIT = 6;

type RewardRow = {
  id: string;
  type: string;
  createdAt: Date | string;
  quantity: number;
  status: string;
};

function formatDate(value: Date | string | null | undefined, locale: string) {
  return value ? formatAppDate(value, locale) : "—";
}

function RuleRow({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs leading-5 text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function RewardStatus({ status }: { status: string }) {
  const t = useExtracted();
  const labels: Record<string, string> = {
    pending: t("Pending approval"),
    approved: t("Approved"),
    rejected: t("Rejected"),
    pending_email: t("Pending approval"),
    sending: t("Sending"),
    sent: t("Sent"),
  };

  return (
    <Badge
      variant={
        status === "rejected" ? "destructive" : status === "pending" ? "outline" : "secondary"
      }
    >
      {labels[status] ?? status}
    </Badge>
  );
}

export function AffiliateActivity({
  locale,
  referrals,
  rewards,
}: {
  locale: string;
  referrals: ReferralRow[];
  rewards: RewardRow[];
}) {
  const t = useExtracted();

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-foreground/10">
          <CardHeader>
            <CardTitle>{t("How the rewards work")}</CardTitle>
            <CardDescription>
              {t("The registration reward and paid-plan reward are separate.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <RuleRow
              icon={<Users className="size-4" />}
              title={t("Every 3 registrations")}
              description={t("Receive 1 reset credit after approval.")}
            />
            <RuleRow
              icon={<RotateCcw className="size-4" />}
              title={t("A paid plan within 7 days")}
              description={t("Choose 3 reset credits or a 30% OFF coupon.")}
            />
            <RuleRow
              icon={<Percent className="size-4" />}
              title={t("Change your paid-plan reward")}
              description={t("You can change it before the referred person buys.")}
            />
          </CardContent>
        </Card>

        <Card className="border-foreground/10">
          <CardHeader>
            <CardTitle>{t("Your activity")}</CardTitle>
            <CardDescription>
              {t("Registration and purchase windows are shown in UTC.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {referrals.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center text-sm text-muted-foreground">
                <Users className="size-5" />
                <span>{t("Your first referral will appear here.")}</span>
              </div>
            ) : (
              <div className="space-y-2">
                {referrals.slice(0, RECENT_REFERRAL_LIMIT).map((referral) => (
                  <div
                    key={referral.id}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {referral.referredName || t("Deni AI member")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("Registered {date}", {
                          date: formatDate(referral.registeredAt, locale),
                        })}
                      </div>
                    </div>
                    {referral.purchasePlanId ? (
                      <Badge variant="secondary" className="shrink-0">
                        {referral.purchasePlanId.replaceAll("_", " ")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        {t("Within {date}", {
                          date: formatDate(referral.purchaseDeadlineAt, locale),
                        })}
                      </Badge>
                    )}
                  </div>
                ))}
                {referrals.length > RECENT_REFERRAL_LIMIT ? (
                  <p className="pt-1 text-xs text-muted-foreground">
                    {t("Showing the {count} most recent referrals.", {
                      count: String(RECENT_REFERRAL_LIMIT),
                    })}
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-foreground/10">
        <CardHeader>
          <CardTitle>{t("Reward history")}</CardTitle>
          <CardDescription>
            {t("See the reset credits and coupons earned from your referrals.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rewards.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No rewards yet.")}</p>
          ) : (
            <div className="space-y-2">
              {rewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex flex-col gap-2 rounded-xl border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {reward.type === "registration_reset"
                        ? t("Three-user milestone reset")
                        : reward.type === "purchase_reset"
                          ? t("Paid-plan reset credits")
                          : reward.type === "discount_coupon"
                            ? t("30% OFF coupon")
                            : t("Plus-month coupon")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(reward.createdAt, locale)} ·{" "}
                      {t("Quantity {count}", { count: String(reward.quantity) })}
                    </div>
                  </div>
                  <RewardStatus status={reward.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
