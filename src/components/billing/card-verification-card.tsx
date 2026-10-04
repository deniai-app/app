"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { CreditCard, ShieldCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { useExtracted } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { stripeJsPromise } from "@/lib/stripe-js";
import { trpc } from "@/lib/trpc/react";

import { runWithLoading } from "@/lib/run-with-loading";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Spinner } from "../ui/spinner";

type Props = {
  isFreeTier: boolean;
  hasVerifiedPaymentMethod: boolean;
};

export function CardVerificationCard({ isFreeTier, hasVerifiedPaymentMethod }: Props) {
  const t = useExtracted();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Only show this card for free-tier users; paid users manage cards via the
  // Stripe portal.
  if (!isFreeTier) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                {t("Verify a card to unlock all models and more usage")}
              </CardTitle>
              {hasVerifiedPaymentMethod && (
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck className="size-3" />
                  {t("Verified")}
                </Badge>
              )}
            </div>
            <CardDescription>
              {hasVerifiedPaymentMethod ? (
                t(
                  "All models are unlocked with 25M basic / 10M premium tokens per month. We will not charge this card.",
                )
              ) : (
                <span className="whitespace-pre-line">
                  {t(
                    "Add a card to unlock all models and lift your monthly limits to 25M basic / 10M premium tokens.\n We place a $1 hold that is released immediately — no actual charge.",
                  )}
                </span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <CardActions
          hasVerifiedPaymentMethod={hasVerifiedPaymentMethod}
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
        />
      </CardContent>
    </Card>
  );
}

function CardActions({
  hasVerifiedPaymentMethod,
  dialogOpen,
  setDialogOpen,
}: {
  hasVerifiedPaymentMethod: boolean;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
}) {
  const t = useExtracted();
  const utils = trpc.useUtils();
  const removeCard = trpc.billing.removeVerifiedCard.useMutation({
    onSuccess: async () => {
      toast.success(t("Card removed."));
      await utils.billing.usage.invalidate();
      await utils.billing.status.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={hasVerifiedPaymentMethod ? "outline" : "default"}
        size="sm"
        onClick={() => setDialogOpen(true)}
      >
        {hasVerifiedPaymentMethod ? t("Replace card") : t("Add card")}
      </Button>
      {hasVerifiedPaymentMethod && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeCard.mutate()}
          disabled={removeCard.isPending}
        >
          {removeCard.isPending ? <Spinner className="size-3" /> : t("Remove card")}
        </Button>
      )}
      <CardSetupDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function CardSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useExtracted();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Add card")}</DialogTitle>
          <DialogDescription>
            {t(
              "We place a temporary $1 authorization and release it immediately. Your card is never actually charged.",
            )}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while the dialog is open, so its SetupIntent fetch state
            is naturally reset (via unmount/remount) instead of being cleared by
            an effect that runs on every `open` change. */}
        {open && <CardSetupIntentLoader onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function CardSetupIntentLoader({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const t = useExtracted();
  const { resolvedTheme } = useTheme();
  const createIntent = trpc.billing.createCardSetupIntent.useMutation();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createIntent
      .mutateAsync()
      .then((data) => {
        if (cancelled) return;
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId);
      })
      .catch((err) => {
        toast.error(err?.message ?? t("Failed to start card verification."));
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
    // This component is only mounted while the dialog is open, so a fresh
    // SetupIntent is fetched once per mount; createIntent is stable for the
    // component's lifetime and adding it would re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appearance: Appearance = {
    theme: resolvedTheme === "dark" ? "night" : "stripe",
  };

  if (!stripeJsPromise) {
    console.error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured.");
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {t("Card verification is unavailable right now.")}
      </p>
    );
  }

  if (!(clientSecret && paymentIntentId)) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <Elements stripe={stripeJsPromise} options={{ clientSecret, appearance }} key={clientSecret}>
      <CardSetupForm paymentIntentId={paymentIntentId} onDone={() => onOpenChange(false)} />
    </Elements>
  );
}

function CardSetupForm({
  paymentIntentId,
  onDone,
}: {
  paymentIntentId: string;
  onDone: () => void;
}) {
  const t = useExtracted();
  const stripe = useStripe();
  const elements = useElements();
  const utils = trpc.useUtils();
  const confirmSetup = trpc.billing.confirmCardSetup.useMutation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);

    await runWithLoading(setSubmitting, async () => {
      try {
        const result = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: "if_required",
        });

        if (result.error) {
          setError(result.error.message ?? t("Card verification failed."));
          return;
        }

        const data = await confirmSetup.mutateAsync({ paymentIntentId });
        toast.success(
          data.funding === "prepaid"
            ? t("Card verified (prepaid).")
            : t("Card verified. Free tier boosted."),
        );
        await utils.billing.usage.invalidate();
        await utils.billing.status.invalidate();
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Failed to confirm card."));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={!stripe || submitting} size="sm">
          {submitting ? <Spinner className="size-3" /> : t("Verify card")}
        </Button>
      </DialogFooter>
    </form>
  );
}
