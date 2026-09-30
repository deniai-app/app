"use client";

import { AlertTriangle, CheckCircle2, FileJson, Upload } from "lucide-react";
import { useExtracted } from "next-intl";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc/react";

type ImportResult = {
  success: boolean;
  importedChats: number;
  importedMessages: number;
  warnings: string[];
  error?: string;
};

export default function ImportSettingsPage() {
  const t = useExtracted();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReading, setIsReading] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  const importMutation = trpc.migration.import.useMutation({
    onSuccess: (result) => {
      setLastResult(result);
      if (result.success) {
        toast.success(
          t("Imported {chats, number} chats ({messages, number} messages).", {
            chats: result.importedChats,
            messages: result.importedMessages,
          }),
        );
        utils.chat.invalidate();
      } else {
        toast.error(result.error || t("No conversations found to import."));
      }
    },
    onError: (error) => {
      setLastResult(null);
      toast.error(error.message || t("Import failed."));
    },
  });

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setIsReading(true);
    setLastResult(null);

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      importMutation.mutate({ payload });
    } catch {
      toast.error(t("That file isn't valid JSON."));
    }
    setIsReading(false);
  };

  const isBusy = isReading || importMutation.isPending;

  return (
    <SettingsPageShell
      title={t("Import")}
      description={t(
        "Bring conversations in from ChatGPT or another Deni AI export. Imported chats are added to your account, not merged with existing ones.",
      )}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t("Import conversations")}</CardTitle>
          <CardDescription>
            {t(
              'Upload a ChatGPT "conversations.json" export, or a Deni AI export file. Only the active branch of each ChatGPT conversation is imported.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
            <div className="inline-flex items-center justify-center size-10 rounded-xl bg-secondary">
              <FileJson className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">{t("Select an export file to import")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("JSON files up to 25 MB.")}</p>
            </div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="gap-2"
            >
              {isBusy ? <Spinner className="size-4" /> : <Upload className="size-4" />}
              {t("Choose file")}
            </Button>
          </div>

          {lastResult ? (
            <div className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {lastResult.success ? (
                  <>
                    <CheckCircle2 className="size-4 text-green-600" />
                    {t("Imported {chats, number} chats ({messages, number} messages).", {
                      chats: lastResult.importedChats,
                      messages: lastResult.importedMessages,
                    })}
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-4 text-amber-600" />
                    {lastResult.error || t("No conversations found to import.")}
                  </>
                )}
              </div>
              {lastResult.warnings.length > 0 ? (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">
                    {t("{count, plural, one {# warning} other {# warnings}}", {
                      count: lastResult.warnings.length,
                    })}
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">
                    {lastResult.warnings.slice(0, 50).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
