"use client";

import { Download, QrCode } from "lucide-react";
import { useExtracted } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

async function toReferralQrDataUrl(url: string) {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(url, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#111827", light: "#ffffff" },
  });
}

export function ReferralQrCode({ url }: { url: string }) {
  const t = useExtracted();
  const [result, setResult] = useState<{
    url: string;
    dataUrl: string | null;
    hasError: boolean;
  } | null>(null);
  const dataUrl = result?.url === url ? result.dataUrl : null;
  const hasError = result?.url === url ? result.hasError : false;

  useEffect(() => {
    let active = true;

    void toReferralQrDataUrl(url)
      .then((value) => {
        if (active) {
          setResult({ url, dataUrl: value, hasError: false });
        }
      })
      .catch(() => {
        if (active) {
          setResult({ url, dataUrl: null, hasError: true });
        }
      });

    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10">
      <div className="flex size-52 items-center justify-center rounded-xl bg-white p-2">
        {dataUrl ? (
          <img src={dataUrl} alt={t("QR code for your referral link")} className="size-full" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <QrCode className={hasError ? "size-10" : "size-10 animate-pulse"} />
            <span className="text-xs">
              {hasError ? t("Could not generate QR code.") : t("Generating QR code…")}
            </span>
          </div>
        )}
      </div>
      {dataUrl ? (
        <Button
          size="sm"
          className="w-full"
          render={<a href={dataUrl} download="deni-ai-referral-qr.png" />}
          nativeButton={false}
        >
          <Download className="size-3.5" />
          {t("Download QR")}
        </Button>
      ) : null}
    </div>
  );
}
