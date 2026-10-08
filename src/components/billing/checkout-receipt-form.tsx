"use client";

import {
  BillingAddressElement,
  CurrencySelectorElement,
  PaymentElement,
} from "@stripe/react-stripe-js/checkout";
import type { StripeCheckoutValue } from "@stripe/react-stripe-js/checkout";
import type { StripeAddressElementChangeEvent, StripePaymentElement } from "@stripe/stripe-js";
import { ChevronDown, LoaderCircle, Tag, X } from "lucide-react";
import Link from "next/link";
import { useExtracted, useLocale } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { runWithLoading } from "@/lib/run-with-loading";
import { formatCardBrand, formatPaymentMethodLabel } from "@/lib/stripe-checkout-receipt";
import { cn } from "@/lib/utils";
import { ReceiptPrinterCard, receiptDeviceCardClassName } from "./subscription-receipt";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";

function CheckoutTermsConsent({
  accepted,
  onAcceptedChange,
  disabled,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  disabled?: boolean;
}) {
  const t = useExtracted();

  return (
    <label className="mb-3 flex items-start gap-2.5 text-left text-[11px] leading-snug text-white/70">
      <Checkbox
        checked={accepted}
        className="mt-0.5 border-white/35 bg-white/6 data-checked:border-white data-checked:bg-white data-checked:text-[#171717]"
        disabled={disabled}
        onCheckedChange={(checked) => onAcceptedChange(checked === true)}
      />
      <span>
        {t(
          "I agree to the Terms of Service. Digital access is granted immediately and is generally non-refundable.",
        )}{" "}
        <Link className="underline underline-offset-2 hover:text-white" href="/legal/terms">
          {t("Terms of Service")}
        </Link>
        {" · "}
        <Link className="underline underline-offset-2 hover:text-white" href="/legal/tokusho">
          {t("特定商取引法")}
        </Link>
      </span>
    </label>
  );
}

function CheckoutStackSection({
  title,
  summary,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible
      className={cn("p-4", receiptDeviceCardClassName)}
      onOpenChange={onOpenChange}
      open={open}
    >
      <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="text-[13px] text-white/50">{title}</div>
          <div className="mt-1 truncate text-[15px] font-medium tracking-tight text-white">
            {summary}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 size-4 shrink-0 text-white/45 transition-transform duration-200",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0"
        keepMounted
      >
        <div className="pt-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CompactPromotion({ checkout }: { checkout: StripeCheckoutValue }) {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const [promotionCode, setPromotionCode] = useState("");
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [isApplyingPromotion, setIsApplyingPromotion] = useState(false);
  const [isRemovingPromotion, setIsRemovingPromotion] = useState(false);
  const appliedDiscount =
    checkout.discountAmounts?.find((discount) => discount.promotionCode) ?? null;

  async function handleApplyPromotionCode() {
    const code = promotionCode.trim();
    if (!code || isApplyingPromotion || isRemovingPromotion) {
      return;
    }

    setPromotionError(null);
    await runWithLoading(setIsApplyingPromotion, async () => {
      try {
        const result = await checkout.applyPromotionCode(code);

        if (result.type === "error") {
          const message =
            result.error.code === "invalidCode"
              ? t("This coupon code is invalid or unavailable.")
              : result.error.message;
          setPromotionError(message);
          toast.error(message);
          return;
        }

        setPromotionCode("");
      } catch (error) {
        const message = localizeError(error, t("Unable to apply coupon code."));
        setPromotionError(message);
        toast.error(message);
      }
    });
  }

  async function handleRemovePromotionCode() {
    if (!appliedDiscount || isApplyingPromotion || isRemovingPromotion) {
      return;
    }

    setPromotionError(null);
    await runWithLoading(setIsRemovingPromotion, async () => {
      try {
        const result = await checkout.removePromotionCode();

        if (result.type === "error") {
          setPromotionError(result.error.message);
          toast.error(result.error.message);
        } else {
          setPromotionCode("");
        }
      } catch (error) {
        const message = localizeError(error, t("Unable to remove coupon code."));
        setPromotionError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="mt-4 space-y-2">
      {appliedDiscount ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white/6 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Tag className="size-3.5 text-white/50" />
            <div className="min-w-0">
              <div className="truncate text-sm text-white">{appliedDiscount.promotionCode}</div>
              <div className="text-[11px] text-white/45">
                {t("Discount applied: {amount}", { amount: appliedDiscount.amount })}
              </div>
            </div>
          </div>
          <Button
            className="h-8 rounded-full px-3 text-white hover:bg-white/10 hover:text-white"
            disabled={isRemovingPromotion}
            onClick={handleRemovePromotionCode}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isRemovingPromotion ? <Spinner className="size-4" /> : <X className="size-4" />}
            {t("Remove")}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            autoComplete="off"
            className="h-9 border-white/10 bg-white/6 text-white placeholder:text-white/35"
            disabled={isApplyingPromotion}
            onChange={(event) => {
              setPromotionCode(event.target.value);
              if (promotionError) {
                setPromotionError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleApplyPromotionCode();
              }
            }}
            placeholder={t("Enter coupon code")}
            value={promotionCode}
          />
          <Button
            className="h-9 border-white/10 bg-white/6 text-white hover:bg-white/10 hover:text-white"
            disabled={isApplyingPromotion || promotionCode.trim().length === 0}
            onClick={handleApplyPromotionCode}
            type="button"
            variant="outline"
          >
            {isApplyingPromotion && <Spinner className="size-4" />}
            {t("Apply")}
          </Button>
        </div>
      )}
      {promotionError ? <p className="text-xs text-red-400">{promotionError}</p> : null}
    </div>
  );
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  link: "Link",
  paypal: "PayPal",
};

function readCardBrand(event: unknown): string | null {
  if (!event || typeof event !== "object") {
    return null;
  }

  const record = event as Record<string, unknown>;
  const details = record.details;
  const candidates = [
    record.brand,
    Array.isArray(record.brands) ? record.brands : null,
    details && typeof details === "object" ? (details as { brand?: unknown }).brand : null,
    details && typeof details === "object" ? (details as { brands?: unknown }).brands : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate && candidate !== "unknown") {
      return candidate;
    }
    if (Array.isArray(candidate)) {
      const brand = candidate.find(
        (item) => typeof item === "string" && item && item !== "unknown",
      );
      if (typeof brand === "string") {
        return brand;
      }
    }
  }

  return null;
}

function formatPaymentTypeLabel(type: string) {
  if (type === "card") {
    return null;
  }

  if (PAYMENT_TYPE_LABELS[type]) {
    return PAYMENT_TYPE_LABELS[type];
  }

  return type
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAddressSummary(
  value: StripeAddressElementChangeEvent["value"] | null,
  locale: string,
  emptyLabel: string,
) {
  if (!value) {
    return emptyLabel;
  }

  const country = value.address.country
    ? (new Intl.DisplayNames([locale], { type: "region" }).of(value.address.country) ??
      value.address.country)
    : null;
  const parts = [value.address.city, value.address.state, country].filter((part): part is string =>
    Boolean(part && part.trim()),
  );

  if (parts.length > 0) {
    return parts.join(", ");
  }

  if (value.name.trim()) {
    return value.name;
  }

  return emptyLabel;
}

export function CheckoutReceiptFormPreview({
  planTitle,
  planDescription,
  homeHref,
  homeLabel,
}: {
  planTitle: string;
  planDescription: string;
  homeHref: string;
  homeLabel: string;
}) {
  const t = useExtracted();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-xl overflow-x-clip px-4 py-6 sm:px-3 sm:py-10">
      <div className="mx-auto flex w-full max-w-[min(24rem,100%)] flex-col gap-3">
        <CheckoutStackSection
          onOpenChange={setPaymentOpen}
          open={paymentOpen}
          summary="Visa •••• 4242"
          title={t("Payment method")}
        >
          <div className="rounded-xl bg-white/6 px-3 py-4 text-[13px] text-white/50">
            {t("Enter your card details to complete checkout.")}
          </div>
        </CheckoutStackSection>
        <CheckoutStackSection
          onOpenChange={setAddressOpen}
          open={addressOpen}
          summary="Tokyo, Japan"
          title={t("Billing address")}
        >
          <div className="rounded-xl bg-white/6 px-3 py-4 text-[13px] text-white/50">
            {t("Use the billing address associated with this card.")}
          </div>
        </CheckoutStackSection>
        <ReceiptPrinterCard
          homeHref={homeHref}
          homeLabel={homeLabel}
          planDescription={planDescription}
          planTitle={planTitle}
          totalAmount="$230.40"
        >
          <CheckoutTermsConsent accepted onAcceptedChange={() => undefined} disabled />
          <button
            className="flex h-auto min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-full bg-white px-4 py-2.5 text-[#171717]"
            type="button"
          >
            <span className="text-sm font-medium">{t("Start subscription")}</span>
            <span className="text-[11px] font-normal text-[#171717]/65">{t("Cancel anytime")}</span>
          </button>
        </ReceiptPrinterCard>
      </div>
    </div>
  );
}

export function CheckoutReceiptForm({
  checkout,
  planTitle,
  planDescription,
  homeHref,
  homeLabel,
  confirmLabel,
  confirmHint,
  isSubmitting,
  submitError,
  onConfirm,
}: {
  checkout: StripeCheckoutValue;
  planTitle: string;
  planDescription: string;
  homeHref: string;
  homeLabel: string;
  confirmLabel: string;
  confirmHint: string;
  isSubmitting: boolean;
  submitError: string | null;
  onConfirm: () => void;
}) {
  const t = useExtracted();
  const locale = useLocale();
  const savedCard = checkout.savedPaymentMethods?.[0]?.card ?? null;
  const [paymentOpen, setPaymentOpen] = useState(() => !savedCard);
  const [addressOpen, setAddressOpen] = useState(() => !checkout.billingAddress);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentType, setPaymentType] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(savedCard?.brand ?? null);
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState<string | null>(
    checkout.savedPaymentMethods?.[0]?.id ?? null,
  );
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [addressValue, setAddressValue] = useState<StripeAddressElementChangeEvent["value"] | null>(
    checkout.billingAddress
      ? {
          name: checkout.billingAddress.name ?? "",
          address: {
            line1: checkout.billingAddress.address.line1 ?? "",
            line2: checkout.billingAddress.address.line2 ?? null,
            city: checkout.billingAddress.address.city ?? "",
            state: checkout.billingAddress.address.state ?? "",
            postal_code: checkout.billingAddress.address.postal_code ?? "",
            country: checkout.billingAddress.address.country,
          },
        }
      : null,
  );

  const selectedSavedCard = selectedSavedMethodId
    ? (checkout.savedPaymentMethods?.find((method) => method.id === selectedSavedMethodId)?.card ??
      null)
    : null;
  const savedPaymentLabel = formatPaymentMethodLabel(
    selectedSavedCard?.brand ?? null,
    selectedSavedCard?.last4 ?? null,
  );
  const paymentTypeLabel = paymentType ? formatPaymentTypeLabel(paymentType) : null;
  const detectedBrandLabel = cardBrand ? formatCardBrand(cardBrand) : null;
  const paymentSummary =
    savedPaymentLabel ??
    detectedBrandLabel ??
    paymentTypeLabel ??
    (paymentComplete ? t("Card") : t("Add a payment method"));
  const addressSummary = formatAddressSummary(addressValue, locale, t("Add a billing address"));

  useEffect(() => {
    let cancelled = false;
    let attached: StripePaymentElement | null = null;

    const handleBrandEvent = (event: unknown) => {
      const brand = readCardBrand(event);
      if (brand) {
        setCardBrand(brand);
      }
    };

    function asBrandEmitter(element: StripePaymentElement) {
      return element as StripePaymentElement & {
        on: (event: string, handler: (event: unknown) => void) => void;
        off: (event: string, handler: (event: unknown) => void) => void;
      };
    }

    function attach() {
      const element = checkout.getPaymentElement?.() ?? null;
      if (!element || cancelled) {
        return Boolean(element);
      }
      attached = element;
      const emitter = asBrandEmitter(element);
      emitter.on("carddetailschange", handleBrandEvent);
      emitter.on("change", handleBrandEvent);
      return true;
    }

    if (attach()) {
      return () => {
        cancelled = true;
        if (attached) {
          const emitter = asBrandEmitter(attached);
          emitter.off("carddetailschange", handleBrandEvent);
          emitter.off("change", handleBrandEvent);
        }
      };
    }

    const interval = window.setInterval(() => {
      if (attach()) {
        window.clearInterval(interval);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (attached) {
        const emitter = asBrandEmitter(attached);
        emitter.off("carddetailschange", handleBrandEvent);
        emitter.off("change", handleBrandEvent);
      }
    };
  }, [checkout]);

  return (
    <div className="mx-auto w-full max-w-xl overflow-x-clip px-4 py-6 sm:px-3 sm:py-10">
      <div className="mx-auto flex w-full max-w-[min(24rem,100%)] flex-col gap-3">
        <CheckoutStackSection
          onOpenChange={setPaymentOpen}
          open={paymentOpen}
          summary={paymentSummary}
          title={t("Payment method")}
        >
          <PaymentElement
            onChange={(event) => {
              const savedMethodId = event.value.payment_method?.id ?? null;
              const type = event.value.type;
              setPaymentComplete(event.complete);
              setPaymentType(type);
              setSelectedSavedMethodId(savedMethodId);
              if (savedMethodId) {
                setCardBrand(
                  checkout.savedPaymentMethods?.find((method) => method.id === savedMethodId)?.card
                    .brand ?? null,
                );
              } else if (type !== "card" && type !== "link") {
                setCardBrand(null);
              }
            }}
            options={{
              fields: {
                billingDetails: {
                  address: "never",
                  email: "never",
                  name: "never",
                },
              },
              layout: {
                type: "tabs",
                defaultCollapsed: false,
                paymentMethodLogoPosition: "end",
                radios: "never",
                spacedAccordionItems: false,
              },
              wallets: {
                applePay: "auto",
                googlePay: "auto",
                link: "auto",
              },
            }}
          />
          <CompactPromotion checkout={checkout} />
        </CheckoutStackSection>

        <CheckoutStackSection
          onOpenChange={setAddressOpen}
          open={addressOpen}
          summary={addressSummary}
          title={t("Billing address")}
        >
          <BillingAddressElement
            onChange={(event) => {
              setAddressValue(event.empty ? null : event.value);
              if (event.complete) {
                setAddressOpen(false);
              }
            }}
            options={{
              display: {
                name: "full",
              },
            }}
          />
        </CheckoutStackSection>

        <ReceiptPrinterCard
          homeHref={homeHref}
          homeLabel={homeLabel}
          planDescription={planDescription}
          planTitle={planTitle}
          totalAmount={checkout.total.total.amount}
        >
          {checkout.currencyOptions && checkout.currencyOptions.length > 1 ? (
            <div className="mb-3 rounded-xl border border-white/8 bg-white/4 px-3 py-2">
              <CurrencySelectorElement />
            </div>
          ) : null}
          {submitError ? <p className="mb-3 text-xs text-red-400">{submitError}</p> : null}
          <CheckoutTermsConsent accepted={acceptedTerms} onAcceptedChange={setAcceptedTerms} />
          <button
            className="flex h-auto min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-full bg-white px-4 py-2.5 text-[#171717] transition-opacity disabled:opacity-40"
            disabled={isSubmitting || !checkout.canConfirm || !acceptedTerms}
            onClick={onConfirm}
            type="button"
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              {isSubmitting ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {confirmLabel}
            </span>
            <span className="text-[11px] font-normal text-[#171717]/65">{confirmHint}</span>
          </button>
        </ReceiptPrinterCard>
      </div>
    </div>
  );
}
