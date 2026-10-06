"use client";

import { Check, Gift, KeyRound, Percent, RotateCcw } from "lucide-react";
import { useLocale, useExtracted } from "next-intl";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { AffiliateActivity } from "@/components/affiliate/affiliate-activity";
import { AffiliateAdminDesk } from "@/components/affiliate/affiliate-admin-desk";
import { AffiliateHero, AffiliateHowItWorksSteps } from "@/components/affiliate/affiliate-hero";
import { AffiliateInvitePanel } from "@/components/affiliate/affiliate-invite-panel";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AFFILIATE_REWARD_PREFERENCES,
  type AffiliateRewardPreference,
} from "@/lib/affiliate-types";
import { trpc } from "@/lib/trpc/react";

const EMPTY_COUPON_DRAFT = { code: "", note: "" };

export function AffiliatePage() {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const locale = useLocale();
  const utils = trpc.useUtils();
  const statusQuery = trpc.affiliate.status.useQuery(undefined, { staleTime: 30_000 });
  const status = statusQuery.data;
  const [claimCode, setClaimCode] = useState("");
  const [couponDrafts, setCouponDrafts] = useState<Record<string, { code: string; note: string }>>(
    {},
  );
  const [rewardPreferenceDraft, setRewardPreferenceDraft] =
    useState<AffiliateRewardPreference | null>(null);

  const claim = trpc.affiliate.claim.useMutation({
    onSuccess: async (result) => {
      if (!("noCode" in result && result.noCode)) {
        toast.success(
          result.alreadyClaimed
            ? t("This referral code is already applied.")
            : t("Referral code applied."),
        );
        setClaimCode("");
        await utils.affiliate.status.invalidate();
      }
    },
    onError: (error) => toast.error(localizeError(error)),
  });

  const consumeResetCredit = trpc.affiliate.consumeResetCredit.useMutation({
    onSuccess: async ({ remaining }) => {
      toast.success(t("Rate limits reset."));
      await Promise.all([
        utils.affiliate.status.invalidate(),
        utils.billing.usage.invalidate(),
        utils.billing.status.invalidate(),
      ]);
      if (remaining === 0) {
        toast.info(t("You have used your last reset credit."));
      }
    },
    onError: (error) => toast.error(localizeError(error)),
  });

  const updateRewardPreference = trpc.affiliate.setRewardPreference.useMutation({
    onSuccess: async () => {
      setRewardPreferenceDraft(null);
      toast.success(t("Reward preference saved."));
      await utils.affiliate.status.invalidate();
    },
    onError: (error) => {
      setRewardPreferenceDraft(null);
      toast.error(localizeError(error));
    },
  });

  const adminQuery = trpc.affiliate.adminOverview.useQuery(undefined, {
    enabled: status?.isAdmin === true,
    retry: false,
  });
  const approveReward = trpc.affiliate.approveResetReward.useMutation({
    onSuccess: async () => {
      toast.success(t("Reset reward approved."));
      await Promise.all([
        utils.affiliate.adminOverview.invalidate(),
        utils.affiliate.status.invalidate(),
      ]);
    },
    onError: (error) => toast.error(localizeError(error)),
  });
  const rejectReward = trpc.affiliate.rejectResetReward.useMutation({
    onSuccess: async () => {
      toast.success(t("Reset reward rejected."));
      await Promise.all([
        utils.affiliate.adminOverview.invalidate(),
        utils.affiliate.status.invalidate(),
      ]);
    },
    onError: (error) => toast.error(localizeError(error)),
  });
  const sendCoupon = trpc.affiliate.sendCouponEmail.useMutation({
    onSuccess: async ({ email }) => {
      toast.success(t("Coupon email sent to {email}.", { email }));
      await Promise.all([
        utils.affiliate.adminOverview.invalidate(),
        utils.affiliate.status.invalidate(),
      ]);
    },
    onError: (error) => toast.error(localizeError(error)),
  });

  if (statusQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("Unable to load affiliate settings")}</AlertTitle>
        <AlertDescription>{localizeError(statusQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  if (statusQuery.isLoading || !status) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const handleCopy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error(t("Copy failed. Select the link and copy it manually."));
    }
  };

  const handleClaim = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!claimCode.trim()) {
      toast.error(t("Enter a referral code."));
      return;
    }
    claim.mutate({ code: claimCode });
  };

  const handleRewardPreferenceChange = (value: string) => {
    if (!value || updateRewardPreference.isPending) {
      return;
    }

    const preference = value as AffiliateRewardPreference;
    if (preference === status.rewardPreference) {
      return;
    }

    setRewardPreferenceDraft(preference);
    updateRewardPreference.mutate({ preference });
  };

  const getDraft = (rewardId: string) => couponDrafts[rewardId] ?? EMPTY_COUPON_DRAFT;
  const updateDraft = (rewardId: string, field: "code" | "note", value: string) => {
    setCouponDrafts((current) => ({
      ...current,
      [rewardId]: { ...getDraft(rewardId), [field]: value },
    }));
  };

  return (
    <SettingsPageShell
      title={t("Affiliate")}
      description={t(
        "Share your referral link. Earn one reset credit for every three registrations, then choose a reward when a referred person buys a paid plan.",
      )}
      className="max-w-6xl"
    >
      <AffiliateHero
        referralCount={status.referralCount}
        referralsUntilNextReward={status.referralsUntilNextReward}
        resetCredits={status.resetCredits}
      />

      <AffiliateInvitePanel
        isResetPending={consumeResetCredit.isPending}
        onCopy={handleCopy}
        onReset={() => consumeResetCredit.mutate()}
        status={status}
      />

      <Card className="border-chart-2/35 bg-chart-2/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gift className="size-4" />
            <CardTitle>{t("Select a paid plan referral reward")}</CardTitle>
          </div>
          <CardDescription>
            {t(
              "If the friend you referred purchases Plus, Pro (monthly), or Max (monthly) within 7 days, you can receive one of the following rewards. Please choose one of them.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            variant="outline"
            value={[rewardPreferenceDraft ?? status.rewardPreference]}
            onValueChange={(values) => handleRewardPreferenceChange(values.at(-1) ?? "")}
            disabled={updateRewardPreference.isPending}
            aria-label={t("Paid-plan reward preference")}
            className="grid w-full sm:grid-cols-2"
          >
            <ToggleGroupItem
              value={AFFILIATE_REWARD_PREFERENCES.resetCredits}
              className="h-auto justify-start whitespace-normal rounded-xl p-4 text-left"
            >
              <RotateCcw className="size-4 shrink-0" />
              <span className="flex flex-col items-start gap-1">
                <span className="font-medium">{t("3 reset credits")}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t("Use them to reset your current usage limits.")}
                </span>
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value={AFFILIATE_REWARD_PREFERENCES.discountCoupon}
              className="h-auto justify-start whitespace-normal rounded-xl p-4 text-left"
            >
              <Percent className="size-4 shrink-0" />
              <span className="flex flex-col items-start gap-1">
                <span className="font-medium">{t("30% OFF coupon")}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t("We will email you a coupon code for one month of free Plus.")}
                </span>
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              "This selection is used for future paid-plan purchases. You can change it before the referred person buys.",
            )}
          </p>
        </CardContent>
      </Card>

      <AffiliateHowItWorksSteps />

      <Card className="border-foreground/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <CardTitle>{t("Apply a referral code")}</CardTitle>
          </div>
          <CardDescription>
            {t(
              "If you registered without a referral link, apply one code within 24 hours of creating your account.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleClaim} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={claimCode}
              onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
              placeholder={t("Enter your 10-character code")}
              maxLength={10}
              autoComplete="off"
              className="font-mono tracking-[0.12em] sm:max-w-xs"
              aria-label={t("Referral code")}
            />
            <Button type="submit" disabled={claim.isPending || claimCode.trim().length === 0}>
              {claim.isPending ? <Spinner /> : <Check className="size-4" />}
              {t("Apply code")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <AffiliateActivity locale={locale} referrals={status.referrals} rewards={status.rewards} />

      {status.isAdmin ? (
        <AffiliateAdminDesk
          errorMessage={adminQuery.error ? localizeError(adminQuery.error) : null}
          getDraft={getDraft}
          locale={locale}
          onApprove={(rewardId) => approveReward.mutate({ rewardId })}
          onReject={(rewardId) => rejectReward.mutate({ rewardId })}
          onSend={(input) => sendCoupon.mutate(input)}
          pending={{
            load: adminQuery.isLoading,
            approveRewardId: approveReward.isPending
              ? (approveReward.variables?.rewardId ?? null)
              : null,
            rejectRewardId: rejectReward.isPending
              ? (rejectReward.variables?.rewardId ?? null)
              : null,
            sendRewardId: sendCoupon.isPending ? (sendCoupon.variables?.rewardId ?? null) : null,
          }}
          rows={adminQuery.data}
          updateDraft={updateDraft}
        />
      ) : null}
    </SettingsPageShell>
  );
}
