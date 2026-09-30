"use client";

import type { OAuthClient } from "@better-auth/oauth-provider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useExtracted, useLocale } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { authClient } from "@/lib/auth-client";
import { formatAppDate } from "@/lib/format-date";

const CLIENTS_QUERY_KEY = ["oauth-clients"] as const;
const AVAILABLE_SCOPES = ["openid", "profile", "email", "offline_access"] as const;
const DEFAULT_SCOPES = ["openid", "profile", "email"];

type AppFormState = {
  name: string;
  homepage: string;
  redirectUris: string;
  applicationType: "web" | "native";
  authentication: "public" | "confidential";
  scopes: string[];
};

type CredentialReveal = {
  title: string;
  clientId: string;
  clientSecret?: string;
};

const EMPTY_FORM: AppFormState = {
  name: "",
  homepage: "",
  redirectUris: "",
  applicationType: "web",
  authentication: "public",
  scopes: DEFAULT_SCOPES,
};

function splitRedirectUris(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function validateForm(form: AppFormState): string | null {
  if (!form.name.trim()) return "name";
  const redirectUris = splitRedirectUris(form.redirectUris);
  if (redirectUris.length === 0) return "redirect";

  try {
    if (form.homepage.trim()) {
      const homepage = new URL(form.homepage.trim());
      const isLoopbackHttp =
        homepage.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(homepage.hostname);
      if (homepage.protocol !== "https:" && !isLoopbackHttp) return "url";
    }
    for (const uri of redirectUris) {
      const callback = new URL(uri);
      if (form.applicationType === "web" && callback.protocol !== "https:") {
        return "web-https";
      }
    }
  } catch {
    return "url";
  }
  return null;
}

function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const uri = new URL(value);
    const isLoopbackHttp =
      uri.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname);
    return uri.protocol === "https:" || isLoopbackHttp ? uri.toString() : null;
  } catch {
    return null;
  }
}

function clientToForm(client: OAuthClient): AppFormState {
  return {
    name: client.client_name ?? "",
    homepage: client.client_uri ?? "",
    redirectUris: client.redirect_uris.join("\n"),
    applicationType: client.application_type === "native" ? "native" : "web",
    authentication: client.token_endpoint_auth_method === "none" ? "public" : "confidential",
    scopes: client.scope?.split(" ").filter(Boolean) ?? DEFAULT_SCOPES,
  };
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useExtracted();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(t("Copied!"));
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      onClick={() => void copy()}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
    </Button>
  );
}

function AppForm({
  form,
  onChange,
  error,
  editing,
}: {
  form: AppFormState;
  onChange: (next: AppFormState) => void;
  error: string | null;
  editing: boolean;
}) {
  const t = useExtracted();

  const toggleScope = (scope: string, checked: boolean) => {
    onChange({
      ...form,
      scopes: checked
        ? [...new Set([...form.scopes, scope])]
        : form.scopes.filter((item) => item !== scope),
    });
  };

  return (
    <FieldGroup>
      <Field data-invalid={error === "name" || undefined}>
        <FieldLabel htmlFor="oauth-app-name">{t("Application name")}</FieldLabel>
        <Input
          id="oauth-app-name"
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder={t("e.g. Acme Workspace")}
          autoComplete="organization"
          aria-invalid={error === "name" || undefined}
        />
        <FieldDescription>{t("Shown to users on the Deni AI consent screen.")}</FieldDescription>
        {error === "name" ? <FieldError>{t("Enter an application name.")}</FieldError> : null}
      </Field>

      <Field data-invalid={error === "url" || undefined}>
        <FieldLabel htmlFor="oauth-app-homepage">{t("Application homepage")}</FieldLabel>
        <Input
          id="oauth-app-homepage"
          type="url"
          value={form.homepage}
          onChange={(event) => onChange({ ...form, homepage: event.target.value })}
          placeholder="https://app.example.com"
          autoComplete="url"
          aria-invalid={error === "url" || undefined}
        />
        <FieldDescription>
          {t("Optional. Users can open this URL from the consent screen.")}
        </FieldDescription>
      </Field>

      <Field
        data-invalid={error === "redirect" || error === "url" || error === "web-https" || undefined}
      >
        <FieldLabel htmlFor="oauth-app-redirects">{t("Callback URLs")}</FieldLabel>
        <Textarea
          id="oauth-app-redirects"
          value={form.redirectUris}
          onChange={(event) => onChange({ ...form, redirectUris: event.target.value })}
          placeholder={"https://app.example.com/auth/callback\nhttp://127.0.0.1:8787/callback"}
          rows={3}
          spellCheck={false}
          aria-invalid={
            error === "redirect" || error === "url" || error === "web-https" || undefined
          }
        />
        <FieldDescription>
          {t("Enter one exact callback URL per line. HTTPS is required outside local development.")}
        </FieldDescription>
        {error === "redirect" ? (
          <FieldError>{t("Add at least one callback URL.")}</FieldError>
        ) : null}
        {error === "url" ? <FieldError>{t("One or more URLs are invalid.")}</FieldError> : null}
        {error === "web-https" ? (
          <FieldError>
            {t(
              "Web applications require HTTPS callback URLs. Choose Native for local loopback callbacks.",
            )}
          </FieldError>
        ) : null}
      </Field>

      <FieldSet>
        <FieldLegend variant="label">{t("Application type")}</FieldLegend>
        <ToggleGroup
          value={[form.applicationType]}
          onValueChange={(value) => {
            const selected = value[0];
            if (selected === "web" || selected === "native") {
              onChange({ ...form, applicationType: selected });
            }
          }}
          className="justify-start"
        >
          <ToggleGroupItem value="web">{t("Web")}</ToggleGroupItem>
          <ToggleGroupItem value="native">{t("Native")}</ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>
          {t("Native apps may use loopback or private-use callback URLs.")}
        </FieldDescription>
      </FieldSet>

      <FieldSet data-disabled={editing || undefined}>
        <FieldLegend variant="label">{t("Client authentication")}</FieldLegend>
        <ToggleGroup
          value={[form.authentication]}
          onValueChange={(value) => {
            const selected = value[0];
            if (selected === "public" || selected === "confidential") {
              onChange({ ...form, authentication: selected });
            }
          }}
          disabled={editing}
          className="justify-start"
        >
          <ToggleGroupItem value="public">{t("Public + PKCE")}</ToggleGroupItem>
          <ToggleGroupItem value="confidential">{t("Confidential")}</ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>
          {editing
            ? t("Authentication type cannot be changed after registration.")
            : t(
                "Use Public for browser, mobile, and desktop apps. Confidential clients receive a secret once.",
              )}
        </FieldDescription>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">{t("Allowed scopes")}</FieldLegend>
        <FieldDescription>
          {t("Users will still approve the scopes requested during each sign in.")}
        </FieldDescription>
        <FieldGroup data-slot="checkbox-group" className="grid gap-3 sm:grid-cols-2">
          {AVAILABLE_SCOPES.map((scope) => (
            <Field key={scope} orientation="horizontal">
              <Checkbox
                id={`oauth-scope-${scope}`}
                checked={form.scopes.includes(scope)}
                disabled={scope === "openid"}
                onCheckedChange={(checked) => toggleScope(scope, checked === true)}
              />
              <FieldLabel htmlFor={`oauth-scope-${scope}`} className="font-normal">
                <span className="font-mono text-xs">{scope}</span>
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}

export default function DeveloperAppsSettingsPage() {
  const t = useExtracted();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAnonymous = session?.user?.isAnonymous === true;
  const clientQueryKey = [...CLIENTS_QUERY_KEY, session?.user?.id ?? "anonymous"] as const;
  const isAuthenticated = Boolean(session?.user) && !isAnonymous;
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OAuthClient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OAuthClient | null>(null);
  const [rotateTarget, setRotateTarget] = useState<OAuthClient | null>(null);
  const [form, setForm] = useState<AppFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [credentialReveal, setCredentialReveal] = useState<CredentialReveal | null>(null);

  const clientsQuery = useQuery({
    queryKey: clientQueryKey,
    queryFn: async () => {
      const { data, error } = await authClient.oauth2.getClients();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(session?.user) && !isAnonymous,
  });
  const hasReachedLimit = clientsQuery.data ? clientsQuery.data.length >= 10 : false;

  const refreshClients = () =>
    queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY, refetchType: "active" });

  const createMutation = useMutation({
    mutationFn: async (input: AppFormState) => {
      const { data, error } = await authClient.oauth2.createClient({
        client_name: input.name.trim(),
        client_uri: input.homepage.trim() || undefined,
        redirect_uris: splitRedirectUris(input.redirectUris),
        token_endpoint_auth_method:
          input.authentication === "public" ? "none" : "client_secret_basic",
        application_type: input.applicationType,
        grant_types: input.scopes.includes("offline_access")
          ? ["authorization_code", "refresh_token"]
          : ["authorization_code"],
        response_types: ["code"],
        scope: input.scopes.join(" "),
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error(t("The OAuth application could not be created."));
      return data;
    },
    onSuccess: (client) => {
      const clientForList = { ...client, client_secret: undefined };
      queryClient.setQueryData<OAuthClient[]>(clientQueryKey, (current) => [
        ...(current ?? []),
        clientForList,
      ]);
      void refreshClients();
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setCredentialReveal({
        title: t("Application registered"),
        clientId: client.client_id,
        clientSecret: client.client_secret,
      });
      toast.success(t("OAuth application created."));
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ clientId, input }: { clientId: string; input: AppFormState }) => {
      const { data, error } = await authClient.oauth2.updateClient({
        client_id: clientId,
        update: {
          client_name: input.name.trim(),
          client_uri: input.homepage.trim() || undefined,
          redirect_uris: splitRedirectUris(input.redirectUris),
          application_type: input.applicationType,
          grant_types: input.scopes.includes("offline_access")
            ? ["authorization_code", "refresh_token"]
            : ["authorization_code"],
          response_types: ["code"],
          scope: input.scopes.join(" "),
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void refreshClients();
      setEditTarget(null);
      toast.success(t("OAuth application updated."));
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await authClient.oauth2.deleteClient({ client_id: clientId });
      if (error) throw new Error(error.message);
      return clientId;
    },
    onSuccess: (deletedClientId) => {
      queryClient.setQueryData<OAuthClient[]>(clientQueryKey, (current) =>
        current?.filter((client) => client.client_id !== deletedClientId),
      );
      void refreshClients();
      setDeleteTarget(null);
      toast.success(t("OAuth application deleted."));
    },
    onError: (error) => toast.error(error.message),
  });

  const rotateMutation = useMutation({
    mutationFn: async (client: OAuthClient) => {
      const { data, error } = await authClient.oauth2.client.rotateSecret({
        client_id: client.client_id,
      });
      if (error) throw new Error(error.message);
      if (!data?.client_secret) throw new Error(t("A new client secret was not returned."));
      return { client, secret: data.client_secret };
    },
    onSuccess: ({ client, secret }) => {
      setRotateTarget(null);
      setCredentialReveal({
        title: t("Client secret rotated"),
        clientId: client.client_id,
        clientSecret: secret,
      });
      toast.success(t("Client secret rotated."));
    },
    onError: (error) => toast.error(error.message),
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreateOpen(true);
  };

  const openEdit = (client: OAuthClient) => {
    setForm(clientToForm(client));
    setFormError(null);
    setEditTarget(client);
  };

  const submitCreate = () => {
    const error = validateForm(form);
    setFormError(error);
    if (error) return;
    createMutation.mutate(form);
  };

  const submitEdit = () => {
    if (!editTarget) return;
    const error = validateForm(form);
    setFormError(error);
    if (error) return;
    updateMutation.mutate({ clientId: editTarget.client_id, input: form });
  };

  const clients = clientsQuery.data ?? [];

  return (
    <SettingsPageShell
      title={t("Developer applications")}
      description={t("Register apps that let people sign in with their Deni AI account.")}
      actions={
        <Button
          onClick={openCreate}
          disabled={sessionPending || !isAuthenticated || hasReachedLimit}
          title={
            sessionPending
              ? t("Loading your session…")
              : !session?.user || isAnonymous
                ? t("Sign in with a permanent account to create applications.")
                : hasReachedLimit
                  ? t("You can register up to 10 applications.")
                  : undefined
          }
        >
          <Plus data-icon="inline-start" />
          {t("Create application")}
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <CardTitle>{t("OAuth 2.1 applications")}</CardTitle>
              <CardDescription>
                {t(
                  "Each application gets a client ID, exact callback URLs, and an independent consent record.",
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {t("{count}/10 apps", { count: String(clients.length) })}
              </Badge>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("Refresh applications")}
                onClick={() => void clientsQuery.refetch()}
                disabled={!isAuthenticated || clientsQuery.isFetching}
              >
                <RefreshCw
                  data-icon="inline-start"
                  className={clientsQuery.isFetching ? "animate-spin" : undefined}
                />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sessionPending ? (
            <div className="flex min-h-56 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : isAnonymous ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShieldCheck />
                </EmptyMedia>
                <EmptyTitle>{t("Sign in with a permanent account")}</EmptyTitle>
                <EmptyDescription>
                  {t("Guest accounts cannot register OAuth applications.")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link href="/auth/sign-in?redirectTo=/settings/developer" />}>
                  {t("Sign in")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : clientsQuery.isLoading ? (
            <div className="flex min-h-56 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : clientsQuery.isError ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRound />
                </EmptyMedia>
                <EmptyTitle>{t("Applications could not be loaded")}</EmptyTitle>
                <EmptyDescription>{clientsQuery.error.message}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void clientsQuery.refetch()}>
                  {t("Try again")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : clients.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRound />
                </EmptyMedia>
                <EmptyTitle>{t("No developer applications yet")}</EmptyTitle>
                <EmptyDescription>
                  {t(
                    "Create an application to receive a client ID and connect your first callback URL.",
                  )}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={openCreate}>
                  <Plus data-icon="inline-start" />
                  {t("Create application")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-4">
              {clients.map((client) => {
                const isPublic = client.token_endpoint_auth_method === "none";
                const clientHomepage = safeExternalUrl(client.client_uri);
                const createdAt = client.client_id_issued_at
                  ? formatAppDate(new Date(client.client_id_issued_at * 1_000), locale)
                  : null;

                return (
                  <Card key={client.client_id} className="shadow-none">
                    <CardHeader>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="truncate text-base">
                              {client.client_name || t("Untitled application")}
                            </CardTitle>
                            <Badge variant="secondary">
                              {isPublic ? t("Public") : t("Confidential")}
                            </Badge>
                            <Badge variant="outline">
                              {client.application_type === "native" ? t("Native") : t("Web")}
                            </Badge>
                          </div>
                          <CardDescription className="mt-2">
                            {createdAt
                              ? t("Created {date}", { date: createdAt })
                              : t("OAuth client")}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {isPublic ? (
                            <Button
                              size="sm"
                              variant="outline"
                              render={
                                <Link
                                  href={`/oauth/example?client_id=${encodeURIComponent(client.client_id)}`}
                                />
                              }
                            >
                              <ArrowUpRight data-icon="inline-start" />
                              {t("Test")}
                            </Button>
                          ) : null}
                          <Button size="sm" variant="outline" onClick={() => openEdit(client)}>
                            <Pencil data-icon="inline-start" />
                            {t("Edit")}
                          </Button>
                          {!isPublic ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRotateTarget(client)}
                            >
                              <RefreshCw data-icon="inline-start" />
                              {t("Rotate secret")}
                            </Button>
                          ) : null}
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("Delete application")}
                            onClick={() => setDeleteTarget(client)}
                          >
                            <Trash2 data-icon="inline-start" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("Client ID")}
                        </span>
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                          <code className="min-w-0 flex-1 truncate font-mono text-xs">
                            {client.client_id}
                          </code>
                          <CopyButton value={client.client_id} label={t("Copy client ID")} />
                        </div>
                      </div>
                      <div className="grid gap-5 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {t("Callback URLs")}
                          </span>
                          <div className="flex flex-col gap-2">
                            {client.redirect_uris.map((uri) => (
                              <code
                                key={uri}
                                className="break-all rounded-lg border px-3 py-2 font-mono text-xs"
                              >
                                {uri}
                              </code>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {t("Allowed scopes")}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {(client.scope?.split(" ").filter(Boolean) ?? []).map((scope) => (
                              <Badge key={scope} variant="outline" className="font-mono">
                                {scope}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      {clientHomepage ? (
                        <a
                          href={clientHomepage}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                          {client.client_uri}
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Integration endpoints")}</CardTitle>
          <CardDescription>
            {t("Use discovery in production so endpoint changes can be adopted automatically.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("Issuer")}</span>
            <code className="font-mono text-xs">/api/auth</code>
          </div>
          <Separator />
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("OpenID discovery")}</span>
            <code className="font-mono text-xs">/.well-known/openid-configuration</code>
          </div>
          <Separator />
          <Button variant="link" className="w-fit px-0" render={<Link href="/oauth/example" />}>
            {t("Open the OAuth playground")}
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Create OAuth application")}</DialogTitle>
            <DialogDescription>
              {t("Register identity, callbacks, and the scopes this application may request.")}
            </DialogDescription>
          </DialogHeader>
          <AppForm form={form} onChange={setForm} error={formError} editing={false} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={submitCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {t("Create application")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Edit OAuth application")}</DialogTitle>
            <DialogDescription>
              {t("Changes apply to future authorization requests immediately.")}
            </DialogDescription>
          </DialogHeader>
          <AppForm form={form} onChange={setForm} error={formError} editing />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={submitEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {t("Save changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(credentialReveal)}
        onOpenChange={(open) => !open && setCredentialReveal(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{credentialReveal?.title}</DialogTitle>
            <DialogDescription>
              {credentialReveal?.clientSecret
                ? t("Copy this secret now. It will not be shown again.")
                : t("Your public client is ready. It must use S256 PKCE.")}
            </DialogDescription>
          </DialogHeader>
          {credentialReveal ? (
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel>{t("Client ID")}</FieldLabel>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs">
                    {credentialReveal.clientId}
                  </code>
                  <CopyButton value={credentialReveal.clientId} label={t("Copy client ID")} />
                </div>
              </Field>
              {credentialReveal.clientSecret ? (
                <Field>
                  <FieldLabel>{t("Client secret")}</FieldLabel>
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-xs">
                      {credentialReveal.clientSecret}
                    </code>
                    <CopyButton
                      value={credentialReveal.clientSecret}
                      label={t("Copy client secret")}
                    />
                  </div>
                  <FieldDescription>
                    {t("Store it in your server environment or secret manager.")}
                  </FieldDescription>
                </Field>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setCredentialReveal(null)}>{t("I saved it")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("Delete OAuth application?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "All access and refresh tokens for this client will stop working. This cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.client_id);
              }}
            >
              {deleteMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t("Delete application")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(rotateTarget)}
        onOpenChange={(open) => !open && setRotateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <RefreshCw />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("Rotate client secret?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "The current secret will stop working immediately. Update the application before its next token exchange.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={rotateMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (rotateTarget) rotateMutation.mutate(rotateTarget);
              }}
            >
              {rotateMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {t("Rotate secret")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageShell>
  );
}
