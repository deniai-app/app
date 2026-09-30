"use client";

import { CheckoutElementsProvider, useCheckout } from "@stripe/react-stripe-js/checkout";
import type { Appearance, Stripe } from "@stripe/stripe-js";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { startTransition, useEffect, useReducer, useState } from "react";
import { toast } from "sonner";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import type { BillingPlanId, ClientPlan, IndividualPlanId, TeamPlanId } from "@/lib/billing";
import { findPlanById, getPlanTier, isMaxTeamPlan } from "@/lib/billing";
import { stripeJsPromise } from "@/lib/stripe-js";
import { makeTRPCClient } from "@/lib/trpc/client";
import { type CheckoutSessionSummary as ReceiptCheckoutSessionSummary } from "@/lib/stripe-checkout-receipt";
import { CheckoutReceiptForm, CheckoutReceiptFormPreview } from "./checkout-receipt-form";
import { runWithLoading } from "@/lib/run-with-loading";
import { SubscriptionShredder } from "./subscription-shredder";
import { SubscriptionReceipt, type SubscriptionReceiptData } from "./subscription-receipt";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Spinner } from "../ui/spinner";

type CheckoutSessionSummary = ReceiptCheckoutSessionSummary;

const PREVIEW_PAID_AT = "2024-06-01T12:00:00.000Z";

type BillingCheckoutProps = {
  scope: "billing";
  planId: IndividualPlanId | null;
  sessionId: string | null;
};

type TeamCheckoutProps = {
  scope: "team";
  organizationId: string | null;
  planId: TeamPlanId | null;
  sessionId: string | null;
};

type StripeCheckoutPageProps = BillingCheckoutProps | TeamCheckoutProps;

type CheckoutBootstrapState = {
  session: CheckoutSessionSummary | null;
  availablePlans: ClientPlan[];
  stripeInstance: Stripe | null;
  bootstrapError: string | null;
  isBootstrapping: boolean;
};

type CheckoutBootstrapAction =
  | { type: "start" }
  | {
      type: "success";
      session: CheckoutSessionSummary;
      availablePlans: ClientPlan[];
      stripeInstance: Stripe;
    }
  | { type: "failure"; message: string };

const INITIAL_CHECKOUT_BOOTSTRAP_STATE: CheckoutBootstrapState = {
  session: null,
  availablePlans: [],
  stripeInstance: null,
  bootstrapError: null,
  isBootstrapping: true,
};

function checkoutBootstrapReducer(
  state: CheckoutBootstrapState,
  action: CheckoutBootstrapAction,
): CheckoutBootstrapState {
  switch (action.type) {
    case "start":
      return {
        ...state,
        bootstrapError: null,
        isBootstrapping: true,
        stripeInstance: null,
      };
    case "success":
      return {
        session: action.session,
        availablePlans: action.availablePlans,
        stripeInstance: action.stripeInstance,
        bootstrapError: null,
        isBootstrapping: false,
      };
    case "failure":
      return {
        ...state,
        bootstrapError: action.message,
        isBootstrapping: false,
      };
  }
}

function useTierLabelValue() {
  const t = useExtracted();

  return (planId: string) => {
    const tier = getPlanTier(planId);
    if (tier === "team") {
      return isMaxTeamPlan(planId) ? t("Max for Teams") : t("Pro for Teams");
    }
    if (tier === "max") {
      return t("Max");
    }

    return tier === "pro" ? t("Pro") : t("Plus");
  };
}

function getStripeCheckoutAppearance(): Appearance {
  return {
    theme: "night",
    inputs: "spaced",
    labels: "above",
    variables: {
      borderRadius: "10px",
      colorBackground: "#111111",
      colorDanger: "#f87171",
      colorPrimary: "#fafafa",
      colorText: "#f5f5f5",
      colorTextPlaceholder: "#8a8a8a",
      colorTextSecondary: "#a3a3a3",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSizeBase: "14px",
      fontWeightMedium: "500",
      fontWeightNormal: "400",
      spacingUnit: "4px",
      gridRowSpacing: "12px",
    },
  };
}

function usePlanLabel() {
  const t = useExtracted();
  const getTierLabel = useTierLabelValue();

  return (planId: BillingPlanId | string | null | undefined) => {
    if (!planId) {
      return t("Checkout");
    }

    const interval = planId.endsWith("_yearly")
      ? t("Yearly")
      : planId.endsWith("_lifetime")
        ? t("Lifetime")
        : t("Monthly");
    if (planId.startsWith("pro_team") || planId.startsWith("max_team")) {
      return isMaxTeamPlan(planId)
        ? t("Max for Teams {name}", { name: interval })
        : t("Pro for Teams {name}", { name: interval });
    }

    return t("{tier} {name}", {
      tier: getTierLabel(planId),
      name: interval,
    });
  };
}

function useTierLabel() {
  const t = useExtracted();
  const getTierLabel = useTierLabelValue();

  return (planId: BillingPlanId | string | null | undefined) => {
    if (!planId) {
      return t("Checkout");
    }

    if (planId.startsWith("pro_team") || planId.startsWith("max_team")) {
      return isMaxTeamPlan(planId) ? t("Max for Teams") : t("Pro for Teams");
    }

    return getTierLabel(planId);
  };
}

function getPlanIntervalValue(planId: BillingPlanId | null | undefined) {
  if (!planId) {
    return null;
  }

  if (planId.endsWith("_lifetime")) {
    return "lifetime";
  }

  return planId.endsWith("_yearly") ? "yearly" : "monthly";
}

function usePlanDescription() {
  const t = useExtracted();

  return (planId: BillingPlanId | string | null | undefined) => {
    const interval = getPlanIntervalValue(planId as BillingPlanId | null | undefined);
    if (interval === "yearly") {
      return t("Annual subscription");
    }
    if (interval === "lifetime") {
      return t("Lifetime access");
    }
    return t("Monthly subscription");
  };
}

function emptyReceiptAmounts(): Pick<
  CheckoutSessionSummary,
  | "amountSubtotal"
  | "amountTax"
  | "amountDiscount"
  | "paymentMethodBrand"
  | "paymentMethodLast4"
  | "paidAt"
> {
  return {
    amountSubtotal: null,
    amountTax: null,
    amountDiscount: null,
    paymentMethodBrand: null,
    paymentMethodLast4: null,
    paidAt: null,
  };
}

function useReceiptCopy() {
  const t = useExtracted();
  const getPlanDescription = usePlanDescription();
  const getTierLabel = useTierLabel();

  return (
    planId: BillingPlanId | string | null | undefined,
    homeHref: string,
    homeLabel: string,
  ) => {
    const tierLabel = getTierLabel(planId);
    const planTitle =
      getPlanTier(planId) === "team" ? tierLabel : t("{tier} plan", { tier: tierLabel });
    const planDescription = getPlanDescription(planId);
    return {
      planTitle,
      planDescription,
      planLineLabel: planTitle,
      homeHref,
      homeLabel,
    };
  };
}

function CheckoutForm({
  backHref,
  returnLabel,
  returnUrl,
  appearance,
  planId,
  plan,
  sessionPaidAt,
}: {
  backHref: string;
  returnLabel: string;
  returnUrl: string;
  appearance: Appearance;
  planId: BillingPlanId | null;
  plan: ClientPlan | null;
  sessionPaidAt: string | null;
}) {
  const t = useExtracted();
  const { replace } = useRouter();
  const checkoutState = useCheckout();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedPaidAt, setConfirmedPaidAt] = useState<string | null>(null);
  const checkout = checkoutState.type === "success" ? checkoutState.checkout : null;
  const receiptHomeLabel = t("Home");
  const receiptCopy = useReceiptCopy()(planId, backHref, receiptHomeLabel);

  useEffect(() => {
    if (!checkout) {
      return;
    }

    checkout.changeAppearance(appearance);
  }, [appearance, checkout]);

  if (checkoutState.type === "loading") {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (checkoutState.type === "error") {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>{t("Checkout unavailable")}</CardTitle>
          <CardDescription>{checkoutState.error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" render={<Link href={backHref} />} nativeButton={false}>
            {returnLabel}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const activeCheckout = checkoutState.checkout;

  if (activeCheckout.status.type === "complete") {
    const savedCard = activeCheckout.savedPaymentMethods?.[0]?.card;
    const receipt: SubscriptionReceiptData = {
      sessionId: activeCheckout.id,
      ...receiptCopy,
      amountTotal: activeCheckout.total.total.minorUnitsAmount,
      amountSubtotal: activeCheckout.total.subtotal.minorUnitsAmount,
      amountTax:
        activeCheckout.total.taxExclusive.minorUnitsAmount ||
        activeCheckout.total.taxInclusive.minorUnitsAmount,
      amountDiscount:
        activeCheckout.total.discount.minorUnitsAmount > 0
          ? activeCheckout.total.discount.minorUnitsAmount
          : null,
      currency: activeCheckout.currency,
      paymentMethodBrand: savedCard?.brand ?? null,
      paymentMethodLast4: savedCard?.last4 ?? null,
      paidAt: confirmedPaidAt ?? sessionPaidAt,
    };

    return <SubscriptionReceipt data={receipt} />;
  }

  async function handleConfirm() {
    if (isSubmitting || !activeCheckout.canConfirm) {
      return;
    }

    setSubmitError(null);
    await runWithLoading(setIsSubmitting, async () => {
      try {
        const result = await activeCheckout.confirm();

        if (result.type === "error") {
          setSubmitError(result.error.message);
          toast.error(result.error.message);
          return;
        }

        setConfirmedPaidAt(new Date().toISOString());
        startTransition(() => {
          replace(returnUrl);
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("Unable to complete checkout. Please try again.");
        setSubmitError(message);
        toast.error(message);
      }
    });
  }

  return (
    <CheckoutReceiptForm
      checkout={activeCheckout}
      confirmHint={activeCheckout.recurring ? t("Cancel anytime") : t("Pay once. Keep access.")}
      confirmLabel={
        activeCheckout.recurring
          ? plan?.trialDays
            ? t("Start {days}-day trial", { days: plan.trialDays.toString() })
            : t("Start subscription")
          : t("Complete payment")
      }
      homeHref={backHref}
      homeLabel={receiptHomeLabel}
      isSubmitting={isSubmitting}
      onConfirm={() => {
        void handleConfirm();
      }}
      planDescription={receiptCopy.planDescription}
      planTitle={receiptCopy.planTitle}
      submitError={submitError}
    />
  );
}

function ServerSessionComplete({
  session,
  planId,
  backHref,
}: {
  session: CheckoutSessionSummary;
  planId: BillingPlanId | null;
  backHref: string;
}) {
  const t = useExtracted();
  const receiptCopy = useReceiptCopy()(planId ?? session.planId, backHref, t("Home"));

  return (
    <SubscriptionReceipt
      data={{
        sessionId: session.sessionId,
        ...receiptCopy,
        amountTotal: session.amountTotal ?? 0,
        amountSubtotal: session.amountSubtotal,
        amountTax: session.amountTax,
        amountDiscount: session.amountDiscount,
        currency: session.currency ?? "usd",
        paymentMethodBrand: session.paymentMethodBrand,
        paymentMethodLast4: session.paymentMethodLast4,
        paidAt: session.paidAt,
      }}
    />
  );
}

function PreviewSubscriptionReceipt({
  planId,
  backHref,
}: {
  planId: BillingPlanId | null;
  backHref: string;
}) {
  const t = useExtracted();
  const receiptCopy = useReceiptCopy()(planId ?? "pro_yearly", backHref, t("Home"));

  return (
    <SubscriptionReceipt
      data={{
        sessionId: "cs_preview_deni2048",
        ...receiptCopy,
        amountTotal: 23040,
        amountSubtotal: 19200,
        amountTax: 3840,
        amountDiscount: null,
        currency: "usd",
        paymentMethodBrand: "visa",
        paymentMethodLast4: "4242",
        paidAt: PREVIEW_PAID_AT,
      }}
    />
  );
}

function PreviewSubscriptionShred({
  planId,
  backHref,
}: {
  planId: BillingPlanId | null;
  backHref: string;
}) {
  const t = useExtracted();
  const [playId, setPlayId] = useState(0);
  const receiptCopy = useReceiptCopy()(planId ?? "pro_yearly", backHref, t("Home"));

  return (
    <SubscriptionShredder
      data={{
        sessionId: "cs_preview_shred2048",
        ...receiptCopy,
        amountTotal: 23040,
        amountSubtotal: 19200,
        amountTax: 3840,
        amountDiscount: null,
        currency: "usd",
        paymentMethodBrand: "visa",
        paymentMethodLast4: "4242",
        paidAt: PREVIEW_PAID_AT,
      }}
      key={playId}
      onClose={() => setPlayId((current) => current + 1)}
      onConfirm={() => new Promise((resolve) => window.setTimeout(resolve, 400))}
      open
    />
  );
}

export function StripeCheckoutPage(props: StripeCheckoutPageProps) {
  const t = useExtracted();
  const { features } = usePlatformCapabilities();
  const { replace } = useRouter();
  const trpcClient = makeTRPCClient();
  const { planId, scope, sessionId } = props;
  const organizationId = props.scope === "team" ? props.organizationId : null;
  const [bootstrapState, dispatchBootstrap] = useReducer(
    checkoutBootstrapReducer,
    INITIAL_CHECKOUT_BOOTSTRAP_STATE,
  );
  const { session, availablePlans, stripeInstance, bootstrapError, isBootstrapping } =
    bootstrapState;
  const resolvedPlanId = (() => {
    const candidate = session?.planId ?? planId;
    return candidate ? (findPlanById(candidate)?.id ?? null) : null;
  })();
  const planLabel = usePlanLabel()(resolvedPlanId ?? session?.planId ?? planId);
  const receiptCopy = useReceiptCopy()(
    resolvedPlanId ?? session?.planId ?? planId ?? "pro_yearly",
    scope === "billing" ? "/settings/billing" : "/settings/team",
    t("Home"),
  );
  const selectedPlan = availablePlans.find((plan) => plan.id === resolvedPlanId) ?? null;
  const checkoutAppearance = getStripeCheckoutAppearance();

  const isReceiptPreview = sessionId === "preview";
  const isCheckoutPreview = sessionId === "preview-form";
  const isShredPreview = sessionId === "preview-shred";
  const backHref = scope === "billing" ? "/settings/billing" : "/settings/team";
  const returnLabel = scope === "billing" ? t("Return to billing") : t("Return to team billing");
  const returnUrl =
    typeof window === "undefined"
      ? backHref
      : `${window.location.origin}${
          scope === "billing"
            ? `/settings/billing/checkout/${session?.sessionId ?? sessionId ?? ""}`
            : `/settings/team/checkout/${session?.sessionId ?? sessionId ?? ""}?organizationId=${organizationId}`
        }`;

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!features.billing || isReceiptPreview || isCheckoutPreview || isShredPreview) {
        return;
      }

      dispatchBootstrap({ type: "start" });

      if (!stripeJsPromise) {
        throw new Error(t("Stripe publishable key is not configured."));
      }

      let loadedStripe: Stripe | null;
      try {
        loadedStripe = await stripeJsPromise;
      } catch {
        throw new Error(
          t("Failed to load Stripe.js. Disable blockers or retry, then try checkout again."),
        );
      }

      if (!loadedStripe) {
        throw new Error(
          t("Failed to load Stripe.js. Disable blockers or retry, then try checkout again."),
        );
      }

      if (scope === "team" && !organizationId) {
        throw new Error(t("An organization is required to start team checkout."));
      }

      const planResult =
        scope === "billing"
          ? await trpcClient.billing.plans.query()
          : await trpcClient.organization.teamPlans.query();

      if (sessionId) {
        const result =
          scope === "billing"
            ? await trpcClient.billing.getCheckoutSession.query({ sessionId })
            : await trpcClient.organization.getTeamCheckoutSession.query({
                organizationId: organizationId!,
                sessionId,
              });

        if (!cancelled) {
          dispatchBootstrap({
            type: "success",
            session: {
              ...result,
              status: result.status ?? "open",
            },
            availablePlans: planResult.plans,
            stripeInstance: loadedStripe,
          });
        }
        return;
      }

      if (!planId) {
        throw new Error(t("A plan is required to start checkout."));
      }

      const result =
        scope === "billing"
          ? await trpcClient.billing.createCheckoutSession.mutate({ planId })
          : await trpcClient.organization.createTeamCheckoutSession.mutate({
              organizationId: organizationId!,
              planId,
            });

      if (cancelled) {
        return;
      }

      const nextSession: CheckoutSessionSummary = {
        sessionId: result.sessionId,
        clientSecret: result.clientSecret,
        status: "open",
        paymentStatus: "unpaid",
        amountTotal: null,
        currency: null,
        mode: "subscription",
        planId,
        ...emptyReceiptAmounts(),
      };

      const nextHref =
        scope === "billing"
          ? `/settings/billing/checkout/${result.sessionId}`
          : `/settings/team/checkout/${result.sessionId}?organizationId=${organizationId}`;

      dispatchBootstrap({
        type: "success",
        session: nextSession,
        availablePlans: planResult.plans,
        stripeInstance: loadedStripe,
      });

      startTransition(() => {
        replace(nextHref);
      });
    }

    bootstrap().catch((error: unknown) => {
      if (!cancelled) {
        const message = error instanceof Error ? error.message : t("Unable to load checkout.");
        dispatchBootstrap({ type: "failure", message });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    isCheckoutPreview,
    features.billing,
    isReceiptPreview,
    isShredPreview,
    organizationId,
    planId,
    replace,
    scope,
    sessionId,
    t,
    trpcClient,
  ]);

  if (isCheckoutPreview) {
    return (
      <CheckoutReceiptFormPreview
        homeHref={backHref}
        homeLabel={t("Home")}
        planDescription={receiptCopy.planDescription}
        planTitle={receiptCopy.planTitle}
      />
    );
  }

  if (isReceiptPreview) {
    return <PreviewSubscriptionReceipt backHref={backHref} planId={planId} />;
  }

  if (isShredPreview) {
    return <PreviewSubscriptionShred backHref={backHref} planId={planId} />;
  }

  if (!features.billing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Billing unavailable")}</CardTitle>
          <CardDescription>
            {t("Plans, checkout, and billing management are turned off.")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const showCheckoutHeader =
    session?.status !== "complete" && !session?.clientSecret && !isBootstrapping;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {showCheckoutHeader ? (
        <div className="bg-background flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">{t("Checkout")}</div>
            <h1 className="text-2xl font-semibold tracking-tight">{planLabel}</h1>
          </div>
          <Button variant="ghost" size="sm" render={<Link href={backHref} />} nativeButton={false}>
            <ArrowLeft className="size-4" />
            {returnLabel}
          </Button>
        </div>
      ) : null}

      {isBootstrapping ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      ) : bootstrapError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>{t("Checkout unavailable")}</CardTitle>
            <CardDescription>{bootstrapError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href={backHref} />} nativeButton={false}>
              {returnLabel}
            </Button>
          </CardContent>
        </Card>
      ) : session?.status === "complete" ? (
        <ServerSessionComplete session={session} planId={resolvedPlanId} backHref={backHref} />
      ) : session?.status === "expired" ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>{t("Checkout unavailable")}</CardTitle>
            <CardDescription>
              {t("Checkout session expired. Start again from the billing page.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href={backHref} />} nativeButton={false}>
              {returnLabel}
            </Button>
          </CardContent>
        </Card>
      ) : session?.clientSecret ? (
        <CheckoutElementsProvider
          key={session.sessionId}
          stripe={stripeInstance}
          options={{
            adaptivePricing: { allowed: true },
            clientSecret: session.clientSecret,
            elementsOptions: {
              appearance: checkoutAppearance,
            },
          }}
        >
          <CheckoutForm
            backHref={backHref}
            returnLabel={returnLabel}
            returnUrl={returnUrl}
            appearance={checkoutAppearance}
            planId={resolvedPlanId}
            plan={selectedPlan}
            sessionPaidAt={session?.paidAt ?? null}
          />
        </CheckoutElementsProvider>
      ) : (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>{t("Checkout unavailable")}</CardTitle>
            <CardDescription>{t("Unable to load checkout.")}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
