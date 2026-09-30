"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FileText, Pencil } from "lucide-react";
import { useExtracted } from "next-intl";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { campaignGroup, paginateCampaigns, type AdCampaignFilter } from "@/lib/ad-campaign-list";

function variantFromForm(form: FormData, language: "japanese" | "english") {
  if (form.get(`${language}Enabled`) !== "on") return null;
  return {
    title: form.get(`${language}Title`),
    description: form.get(`${language}Description`),
  };
}

function VariantFields({
  language,
  idPrefix,
  title,
  description,
}: {
  language: "japanese" | "english";
  idPrefix: string;
  title?: string | null;
  description?: string | null;
}) {
  const t = useExtracted();
  const [enabled, setEnabled] = useState(Boolean(title && description));
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name={`${language}Enabled`}
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {language === "japanese" ? t("Japanese variant") : t("English variant")}
      </label>
      {enabled && (
        <>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-${language}-title`}>{t("Ad title")}</FieldLabel>
            <Input
              id={`${idPrefix}-${language}-title`}
              name={`${language}Title`}
              defaultValue={title ?? ""}
              minLength={3}
              maxLength={100}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-${language}-description`}>
              {t("Ad description")}
            </FieldLabel>
            <Textarea
              id={`${idPrefix}-${language}-description`}
              name={`${language}Description`}
              defaultValue={description ?? ""}
              minLength={10}
              maxLength={240}
              required
            />
          </Field>
        </>
      )}
    </fieldset>
  );
}

type Campaign = {
  id: string;
  title: string;
  description: string;
  defaultLanguage: "ja" | "en" | null;
  japaneseTitle: string | null;
  japaneseDescription: string | null;
  englishTitle: string | null;
  englishDescription: string | null;
  url: string;
  plan: string;
  status: string;
  reviewReason: string | null;
  budgetYen: number;
  spentYen: number;
  impressions: number;
  clicks: number;
  weightedImpressionUnits: number;
  weightedClickUnits: number;
  stripeSessionId: string | null;
  paymentState: "open" | "paid" | "unknown" | null;
  endsAt: string | null;
};

export function AdsSettings() {
  const t = useExtracted();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<AdCampaignFilter>("all");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editError, setEditError] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState<"ja" | "en">("ja");
  const [editLanguage, setEditLanguage] = useState<"ja" | "en">("ja");
  const [plan, setPlan] = useState("cpm");
  const [budget, setBudget] = useState(3000);
  function startEditing(ad: Campaign) {
    setEditLanguage(ad.defaultLanguage ?? (ad.japaneseTitle ? "en" : "ja"));
    setEditingCampaign(ad);
    setEditError("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCampaign || busy) return;
    const previous = {
      title: editingCampaign.title,
      description: editingCampaign.description,
      defaultLanguage: editingCampaign.defaultLanguage,
      url: editingCampaign.url,
      japaneseVariant:
        editingCampaign.japaneseTitle && editingCampaign.japaneseDescription
          ? {
              title: editingCampaign.japaneseTitle,
              description: editingCampaign.japaneseDescription,
            }
          : null,
      englishVariant:
        editingCampaign.englishTitle && editingCampaign.englishDescription
          ? { title: editingCampaign.englishTitle, description: editingCampaign.englishDescription }
          : null,
    };
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setEditError("");
    try {
      const response = await fetch(`/api/ads/campaigns/${encodeURIComponent(editingCampaign.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          defaultLanguage: editLanguage,
          url: form.get("url"),
          japaneseVariant: editLanguage === "en" ? variantFromForm(form, "japanese") : null,
          englishVariant: editLanguage === "ja" ? variantFromForm(form, "english") : null,
          previous,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        if (response.status === 409) await load();
        throw new Error(
          response.status === 422
            ? `${t("Ad edit rejected")}: ${result?.reason ?? t("Please revise and try again")}`
            : response.status === 429
              ? t("Daily review limit reached")
              : response.status === 409
                ? t("Ad changed. Refresh and edit again.")
                : t("Unable to update ad"),
        );
      }
      await load();
      if (editingCampaign.status === "rejected") {
        setFilter("all");
        setPage(1);
      }
      setEditingCampaign(null);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : t("Unable to update ad"));
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    setLoadError(false);
    try {
      const response = await fetch("/api/ads/campaigns", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load campaigns");
      setCampaigns((await response.json()).campaigns);
      setNow(Date.now());
    } catch {
      setLoadError(true);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          defaultLanguage,
          url: form.get("url"),
          japaneseVariant: defaultLanguage === "en" ? variantFromForm(form, "japanese") : null,
          englishVariant: defaultLanguage === "ja" ? variantFromForm(form, "english") : null,
          plan,
          budgetYen: plan === "fixed" ? 3000 : budget,
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429 ? t("Daily submission limit reached") : t("Unable to submit ad"),
        );
      await load();
      setFilter("all");
      setPage(1);
      formElement.reset();
      setDefaultLanguage("ja");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Unable to submit ad"));
    } finally {
      setBusy(false);
    }
  }

  async function purchase(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ads/campaigns/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        await load();
        throw new Error(
          response.status === 409
            ? t("Campaign unavailable or fixed slot occupied")
            : t("Checkout unavailable"),
        );
      }
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Checkout unavailable"));
      setBusy(false);
    }
  }

  function statusLabel(ad: Campaign) {
    if (ad.status === "active" && campaignGroup(ad, now) === "ended") return t("Ended");
    if (ad.status === "approved" && ad.paymentState === "paid")
      return t("Payment received, activation pending");
    if (ad.status === "approved" && ad.stripeSessionId) return t("Awaiting payment");
    switch (ad.status) {
      case "approved":
        return t("Approved");
      case "active":
        return t("Active");
      case "rejected":
        return t("Rejected");
      case "paused":
        return t("Paused");
      default:
        return t("Under review");
    }
  }

  function statusVariant(ad: Campaign): "default" | "destructive" | "secondary" | "outline" {
    const group = campaignGroup(ad, now);
    if (group === "active") return "default";
    if (group === "rejected") return "destructive";
    if (group === "ended") return "secondary";
    return "outline";
  }

  const { items, currentPage, totalPages, totalItems } = paginateCampaigns(
    campaigns ?? [],
    filter,
    page,
    now,
  );
  const planOptions = [
    { value: "cpm", label: t("¥200 per 1,000 views") },
    { value: "cpc", label: t("¥30 per click") },
    { value: "fixed", label: t("¥3,000 for a fixed 30-day chat slot") },
  ];
  const filters: { value: AdCampaignFilter; label: string }[] = [
    { value: "all", label: t("All") },
    { value: "active", label: t("Active") },
    { value: "rejected", label: t("Rejected") },
    { value: "ended", label: t("Ended") },
  ];

  return (
    <SettingsPageShell
      title={t("Deni AI Ads")}
      description={t(
        "Submit a text ad for AI review. Only approved ads can be purchased and displayed in chat.",
      )}
    >
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <CardHeader>
            <CardTitle>{t("Create an ad")}</CardTitle>
            <CardDescription>{t("Choose a plan and submit your ad for review.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="new-ad-language">{t("Default ad language")}</FieldLabel>
                <Select
                  value={defaultLanguage}
                  onValueChange={(value) => setDefaultLanguage(value as "ja" | "en")}
                >
                  <SelectTrigger id="new-ad-language" className="w-full">
                    <SelectValue>
                      {defaultLanguage === "ja" ? t("Japanese") : t("English")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ja">{t("Japanese")}</SelectItem>
                    <SelectItem value="en">{t("English")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="new-ad-title">{t("Ad title")}</FieldLabel>
                <Input id="new-ad-title" name="title" minLength={3} maxLength={100} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-ad-description">{t("Ad description")}</FieldLabel>
                <Textarea
                  id="new-ad-description"
                  name="description"
                  minLength={10}
                  maxLength={240}
                  required
                />
              </Field>
              <FieldDescription>
                {t(
                  "Optionally add a version in the other language. Both versions are reviewed before publishing.",
                )}
              </FieldDescription>
              <VariantFields
                key={`new-${defaultLanguage}-${campaigns?.length ?? 0}`}
                language={defaultLanguage === "ja" ? "english" : "japanese"}
                idPrefix="new"
              />
              <Field>
                <FieldLabel htmlFor="new-ad-url">{t("Destination URL (HTTPS)")}</FieldLabel>
                <Input id="new-ad-url" name="url" type="url" pattern="https://.*" required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="new-ad-plan">{t("Pricing plan")}</FieldLabel>
                  <Select
                    items={planOptions}
                    value={plan}
                    onValueChange={(value) => {
                      if (value !== null) setPlan(value);
                    }}
                  >
                    <SelectTrigger id="new-ad-plan" className="w-full">
                      <SelectValue>
                        {planOptions.find((option) => option.value === plan)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {planOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {plan !== "fixed" && (
                  <Field>
                    <FieldLabel htmlFor="new-ad-budget">
                      {t("Prepaid budget (JPY, 300–100,000)")}
                    </FieldLabel>
                    <Input
                      id="new-ad-budget"
                      type="number"
                      min="300"
                      max="100000"
                      step="1"
                      value={budget}
                      onChange={(event) => setBudget(Number(event.target.value))}
                      required
                    />
                  </Field>
                )}
              </div>
              <FieldDescription>
                {t(
                  "Views are billed in groups of five (¥1). Guest views and clicks count as 0.5 each for billing. Repeated views within 10 minutes and clicks within one day from the same account are not billed. Ads stop when the prepaid budget is used. Fixed slots are subject to availability.",
                )}
              </FieldDescription>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden="true" /> : null}
              {busy ? t("Reviewing…") : t("Submit for AI review")}
            </Button>
          </CardFooter>
        </form>
      </Card>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold tracking-tight">{t("Your ads")}</h2>
        {loadError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              {t("Unable to load ads")}
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                {t("Retry")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {campaigns === null && !loadError && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
          >
            <Spinner aria-hidden="true" className="size-4" />
            <span>{t("Loading ads…")}</span>
          </div>
        )}
        {campaigns?.length === 0 && !loadError && (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText className="size-5" />
              </EmptyMedia>
              <EmptyTitle>{t("No ads yet")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {campaigns && campaigns.length > 0 && (
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={1}
            value={[filter]}
            onValueChange={(values) => {
              const next = values.at(-1) as AdCampaignFilter | undefined;
              if (!next) return;
              setFilter(next);
              setPage(1);
              setEditingCampaign(null);
            }}
            aria-label={t("Filter ads")}
            className="flex-wrap"
          >
            {filters.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        {campaigns && campaigns.length > 0 && totalItems === 0 && (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{t("No ads in this category")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {items.map((ad) => (
          <article
            key={ad.id}
            className="flex flex-col gap-3 rounded-xl border border-border p-4 text-sm sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="min-w-0 break-words text-sm font-semibold">{ad.title}</h3>
              <Badge variant={statusVariant(ad)}>{statusLabel(ad)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {ad.plan.toUpperCase()} · {ad.weightedImpressionUnits / 2} {t("billable views")} ·{" "}
              {ad.weightedClickUnits / 2} {t("billable clicks")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("Spent")}: ¥{ad.spentYen} / ¥{ad.budgetYen}
              {ad.endsAt ? ` · ${new Date(ad.endsAt).toLocaleDateString()}` : ""}
            </p>
            {ad.reviewReason && <p className="text-sm text-muted-foreground">{ad.reviewReason}</p>}
            {(ad.status === "active" ||
              ad.status === "approved" ||
              (ad.status === "rejected" && !ad.stripeSessionId)) &&
              editingCampaign?.id !== ad.id && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => startEditing(ad)}
                  className="self-start"
                >
                  <Pencil className="size-3.5" />
                  {t("Edit")}
                </Button>
              )}
            {editingCampaign?.id === ad.id && (
              <form
                onSubmit={saveEdit}
                className="mt-2 flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4"
              >
                <FieldDescription>
                  {t(
                    "Changes to ad text or URL are AI-reviewed before publishing. Pricing and budget cannot be changed.",
                  )}
                </FieldDescription>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor={`edit-language-${ad.id}`}>
                      {t("Default ad language")}
                    </FieldLabel>
                    <Select
                      value={editLanguage}
                      onValueChange={(value) => setEditLanguage(value as "ja" | "en")}
                    >
                      <SelectTrigger id={`edit-language-${ad.id}`} className="w-full">
                        <SelectValue>
                          {editLanguage === "ja" ? t("Japanese") : t("English")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ja">{t("Japanese")}</SelectItem>
                        <SelectItem value="en">{t("English")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`edit-title-${ad.id}`}>{t("Ad title")}</FieldLabel>
                    <Input
                      id={`edit-title-${ad.id}`}
                      name="title"
                      defaultValue={editingCampaign.title}
                      minLength={3}
                      maxLength={100}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`edit-description-${ad.id}`}>
                      {t("Ad description")}
                    </FieldLabel>
                    <Textarea
                      id={`edit-description-${ad.id}`}
                      name="description"
                      defaultValue={editingCampaign.description}
                      minLength={10}
                      maxLength={240}
                      required
                    />
                  </Field>
                  <VariantFields
                    key={`${ad.id}-${editLanguage}`}
                    language={editLanguage === "ja" ? "english" : "japanese"}
                    idPrefix={ad.id}
                    title={editLanguage === "ja" ? ad.englishTitle : ad.japaneseTitle}
                    description={
                      editLanguage === "ja" ? ad.englishDescription : ad.japaneseDescription
                    }
                  />
                  <Field>
                    <FieldLabel htmlFor={`edit-url-${ad.id}`}>
                      {t("Destination URL (HTTPS)")}
                    </FieldLabel>
                    <Input
                      id={`edit-url-${ad.id}`}
                      name="url"
                      type="url"
                      pattern="https://.*"
                      defaultValue={editingCampaign.url}
                      required
                    />
                  </Field>
                </FieldGroup>
                {editError && <FieldError>{editError}</FieldError>}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy}>
                    {busy ? <Spinner aria-hidden="true" /> : null}
                    {busy ? t("Reviewing…") : t("Save changes")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditingCampaign(null)}
                  >
                    {t("Cancel")}
                  </Button>
                </div>
              </form>
            )}
            {ad.status === "approved" && ad.stripeSessionId && ad.paymentState !== "open" && (
              <p className="text-muted-foreground">
                {t(
                  "Payment is being verified. Do not pay again. If this persists, contact support.",
                )}
              </p>
            )}
            {ad.status === "approved" && (!ad.stripeSessionId || ad.paymentState === "open") && (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void purchase(ad.id)}
                className="self-start"
              >
                {ad.paymentState === "open" ? t("Resume payment") : t("Pay and publish")}
              </Button>
            )}
          </article>
        ))}
        {totalPages > 1 && (
          <nav aria-label={t("Ad pages")} className="flex items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => {
                setPage(currentPage - 1);
                setEditingCampaign(null);
              }}
            >
              {t("Previous")}
            </Button>
            <span aria-live="polite" className="text-sm text-muted-foreground">
              {t("Page {page} of {total}", {
                page: String(currentPage),
                total: String(totalPages),
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => {
                setPage(currentPage + 1);
                setEditingCampaign(null);
              }}
            >
              {t("Next")}
            </Button>
          </nav>
        )}
      </div>
    </SettingsPageShell>
  );
}
