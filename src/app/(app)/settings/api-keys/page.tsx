"use client";

import { Check, Copy, Key, Plus, Trash2 } from "lucide-react";
import { useExtracted, useLocale } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { formatAppDate } from "@/lib/format-date";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc/react";

export default function ApiKeysSettingsPage() {
  const locale = useLocale();
  const t = useExtracted();
  const utils = trpc.useUtils();
  const { data: session } = authClient.useSession();
  const isAnonymous = Boolean(session?.user?.isAnonymous);

  const keysQuery = trpc.apiKeys.list.useQuery();
  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      utils.apiKeys.list.invalidate();
      setNewKey(data.key);
      toast.success(t("API key created."));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      utils.apiKeys.list.invalidate();
      setRevokeTarget(null);
      toast.success(t("API key revoked."));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const handleCreate = () => {
    if (!keyName.trim()) return;
    createMutation.mutate({ name: keyName.trim() });
  };

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    toast.success(t("Copied!"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setKeyName("");
    setNewKey(null);
    setCopied(false);
  };

  return (
    <SettingsPageShell
      title={t("API Keys")}
      description={t("Generate API keys for the Flixa extension and other integrations.")}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{t("Your API Keys")}</CardTitle>
            <CardDescription>{t("Keys you've created for external integrations.")}</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={isAnonymous || (keysQuery.data?.length ?? 0) >= 5}
          >
            <Plus className="size-4" />
            {t("Create")}
          </Button>
        </CardHeader>
        <CardContent>
          {isAnonymous ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="inline-flex items-center justify-center size-10 rounded-lg bg-secondary mb-3">
                <Key className="size-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm">{t("Sign in to create API keys.")}</p>
              <p className="text-xs mt-1">
                {t("Guest accounts cannot create API keys or use the Flixa extension.")}
              </p>
            </div>
          ) : keysQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-6" />
            </div>
          ) : keysQuery.data?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="inline-flex items-center justify-center size-10 rounded-lg bg-secondary mb-3">
                <Key className="size-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm">{t("No API keys yet.")}</p>
              <p className="text-xs mt-1">{t("Create a key to connect the Flixa extension.")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {keysQuery.data?.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{k.name}</span>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <code className="font-mono">{k.keyPrefix}••••••••</code>
                      <span>
                        {t("Created {date}", {
                          date: formatAppDate(k.createdAt, locale),
                        })}
                      </span>
                      <span>
                        {k.lastUsedAt
                          ? t("Last used {date}", {
                              date: formatAppDate(k.lastUsedAt, locale),
                            })
                          : t("Never used")}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setRevokeTarget(k.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => !open && handleCloseCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newKey ? t("API Key Created") : t("Create API Key")}</DialogTitle>
            <DialogDescription>
              {newKey
                ? t("Copy this key now. It will not be shown again.")
                : t("Enter a name for this key.")}
            </DialogDescription>
          </DialogHeader>

          {newKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono break-all">
                  {newKey}
                </code>
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="key-name">{t("Key Name")}</Label>
                <Input
                  id="key-name"
                  placeholder={t("e.g. Flixa Extension")}
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {newKey ? (
              <Button onClick={handleCloseCreate}>{t("Done")}</Button>
            ) : (
              <Button onClick={handleCreate} disabled={!keyName.trim() || createMutation.isPending}>
                {createMutation.isPending && <Spinner />}
                {t("Create")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (revokeMutation.isPending) return;
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Revoke API key?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "This will immediately invalidate the key. Any applications using it will stop working.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && revokeMutation.mutate({ id: revokeTarget })}
              disabled={revokeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeMutation.isPending && <Spinner />}
              {t("Revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageShell>
  );
}
