"use client";

import { useEffect, useRef, useState } from "react";
import { useExtracted, useLocale } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { AdCreative } from "@/lib/ads";

type AdSlotProps = {
  viewerId: string;
  chatId: string;
  visible: boolean;
  requestInFlight: boolean;
  className?: string;
  excludeId?: string | null;
  onAdSelected?: (id: string) => void;
};

export function AdSlot({
  viewerId,
  chatId,
  visible,
  requestInFlight,
  className,
  excludeId,
  onAdSelected,
}: AdSlotProps) {
  const t = useExtracted();
  const locale = useLocale();
  const [requestNumber, setRequestNumber] = useState(0);
  const previousInFlight = useRef(requestInFlight);
  const [delivery, setDelivery] = useState<{
    viewerId: string;
    chatId: string;
    requestNumber: number;
    ad: AdCreative | null;
  } | null>(null);
  const isCurrent =
    delivery?.viewerId === viewerId &&
    delivery.chatId === chatId &&
    delivery.requestNumber === requestNumber;
  const ad = isCurrent && delivery ? delivery.ad : null;
  const isLoading = !isCurrent;
  const adRef = useRef<HTMLElement>(null);
  const excludedId = useRef(excludeId);

  useEffect(() => {
    if (requestInFlight && !previousInFlight.current) setRequestNumber((number) => number + 1);
    previousInFlight.current = requestInFlight;
  }, [requestInFlight]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ placement: "chat", locale });
    if (excludedId.current) params.set("exclude", excludedId.current);
    fetch(`/api/ads?${params}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { ad?: AdCreative | null } | null) => {
        if (controller.signal.aborted) return;
        setDelivery({ viewerId, chatId, requestNumber, ad: data?.ad ?? null });
        if (data?.ad) {
          excludedId.current = data.ad.id;
          onAdSelected?.(data.ad.id);
        }
      })
      .catch(() => {
        // Ads are optional; never block chat on a failed ad request.
        if (!controller.signal.aborted) setDelivery({ viewerId, chatId, requestNumber, ad: null });
      });
    return () => controller.abort();
  }, [chatId, locale, onAdSelected, requestNumber, viewerId]);

  useEffect(() => {
    if (!visible || !ad) return;
    const element = adRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        fetch("/api/ads/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: ad.id, token: ad.token }),
          keepalive: true,
        }).catch(() => {});
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ad, visible]);

  if (!visible) return null;
  if (isLoading) {
    return (
      <div
        role="status"
        className={cn(
          "flex min-h-20 items-center justify-center gap-2 rounded-xl border border-border/60 text-sm text-muted-foreground",
          className,
        )}
      >
        <Spinner aria-hidden="true" />
        {t("Loading ads…")}
      </div>
    );
  }
  if (!ad) return null;

  return (
    <aside
      ref={adRef}
      aria-label={t("Advertisement")}
      className={cn(
        "relative overflow-hidden w-full rounded-2xl border border-border/70 bg-card/90 px-4 mx-0! py-3.5 shadow-sm",
        "before:absolute before:inset-y-4 before:left-0 before:w-0.5 before:rounded-full before:bg-primary/60",
        className,
      )}
    >
      <div className="w-full flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="min-w-0 flex-1">
          <strong className="mt-1 block line-clamp-2 max-h-10 overflow-hidden wrap-anywhere text-[15px] leading-5 font-semibold tracking-tight text-foreground">
            {ad.title}
          </strong>
          <p className="mt-0.5 line-clamp-2 max-h-10 overflow-hidden wrap-anywhere text-sm leading-5 text-muted-foreground">
            {ad.description}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary/70" />
          {t("Advertisement")}
        </span>
        <a
          href={ad.url}
          target="_blank"
          rel="sponsored noopener"
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:self-center"
        >
          {t("Learn more")}
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </a>
      </div>
    </aside>
  );
}
