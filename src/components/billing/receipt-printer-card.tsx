"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { useExtracted } from "next-intl";
import type { ReactNode } from "react";
import DeniAIIcon from "@/components/deni-ai-icon";
import { cn } from "@/lib/utils";

export const receiptDeviceCardClassName =
  "rounded-[1.7rem] border border-white/8 bg-[#171717] text-white shadow-[0_18px_50px_-24px_rgba(0,0,0,0.65)]";

export function ReceiptPrinterCard({
  homeHref,
  homeLabel,
  planTitle,
  planDescription,
  totalAmount,
  children,
  outlet,
}: {
  homeHref: string;
  homeLabel: string;
  planTitle: string;
  planDescription: string;
  totalAmount: string;
  children: ReactNode;
  outlet?: ReactNode;
}) {
  const t = useExtracted();

  return (
    <div className="relative">
      <div
        className={cn("relative z-10 p-3.5", receiptDeviceCardClassName, outlet ? "pb-2" : "pb-3")}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 text-white">
            <DeniAIIcon className="size-6" />
          </div>
          <Link
            aria-label={homeLabel}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/8 px-2.5 text-[13px] text-white/90 transition-colors hover:bg-white/12 sm:px-3"
            href={homeHref}
          >
            <Home className="size-3.5" />
            <span className="hidden min-[400px]:inline">{homeLabel}</span>
          </Link>
        </div>

        <div className="mt-6 flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium tracking-tight">{planTitle}</div>
            <div className="mt-0.5 truncate text-[13px] text-white/50">{planDescription}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-white/45">{t("Total")}</div>
            <div className="mt-0.5 text-[15px] font-medium tabular-nums">{totalAmount}</div>
          </div>
        </div>

        <div className="mt-5 px-1">{children}</div>

        <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-black shadow-[inset_0_2px_3px_rgba(0,0,0,0.85)]">
          <div className="absolute inset-x-4 top-0 h-px bg-white/10" />
        </div>
      </div>
      {outlet}
    </div>
  );
}
