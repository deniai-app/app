"use client";

import { Download } from "lucide-react";
import { useExtracted } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { triggerDownload } from "@/lib/chat-export";
import { trpc } from "@/lib/trpc/react";

export function ExportData() {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const exportData = trpc.account.exportData.useMutation({
    onSuccess: (payload) => {
      triggerDownload(
        JSON.stringify(payload, null, 2),
        `deni-ai-export-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
      );
      toast.success(t("Your data export has been downloaded."));
    },
    onError: (error) => {
      toast.error(localizeError(error, t("Failed to export account data.")));
    },
  });

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">{t("Download your data")}</h2>
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("Account export")}</p>
            <p className="text-xs text-muted-foreground">
              {t(
                "Download a JSON copy of your profile, chats, memories, projects, and security activity. Secrets such as passwords and API keys are not included.",
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={exportData.isPending}
            onClick={() => exportData.mutate()}
          >
            {exportData.isPending ? <Spinner /> : <Download className="size-4" />}
            {t("Export JSON")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
