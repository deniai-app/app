"use client";

import { addPasskeyOptions, type PasskeyAuthClient } from "@better-auth-ui/core/plugins/passkey";
import { useAuth, useAuthPlugin, useSession } from "@better-auth-ui/react";
import { useMutation } from "@tanstack/react-query";
import { Fingerprint } from "lucide-react";
import type { SyntheticEvent } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { passkeyPlugin } from "@/lib/auth/passkey-plugin";

export type AddPasskeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddPasskeyDialog({ open, onOpenChange }: AddPasskeyDialogProps) {
  const { authClient, localization } = useAuth();
  const { localization: passkeyLocalization } = useAuthPlugin(passkeyPlugin);

  const passkeyClient = authClient as PasskeyAuthClient;
  const { data: session } = useSession(authClient);

  const { mutate: addPasskey, isPending: isAdding } = useMutation({
    ...addPasskeyOptions(passkeyClient, session?.user.id),
    // `addPasskey` resolves with `{ data: null, error }` for WebAuthn failures
    // (cancelled prompt, unsupported authenticator) and for server verification
    // failures. The stock mutation treats that as success, so the dialog
    // closed without adding a passkey or showing any message.
    mutationFn: async (variables?: Parameters<PasskeyAuthClient["passkey"]["addPasskey"]>[0]) => {
      const result = await passkeyClient.passkey.addPasskey(variables);
      if (result?.error) throw result.error;
      return result;
    },
  });

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const name = (formData.get("name") as string)?.trim();

    addPasskey(name ? { name } : undefined, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Fingerprint />
            </AlertDialogMedia>

            <AlertDialogTitle>{passkeyLocalization.addPasskey}</AlertDialogTitle>

            <AlertDialogDescription>
              {passkeyLocalization.passkeysDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Field>
            <Label htmlFor="passkey-name">{passkeyLocalization.name}</Label>

            <Input
              id="passkey-name"
              name="name"
              autoFocus
              placeholder={localization.settings.optional}
              disabled={isAdding}
            />

            <FieldError />
          </Field>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAdding}>
              {localization.settings.cancel}
            </AlertDialogCancel>

            <Button type="submit" disabled={isAdding}>
              {isAdding && <Spinner />}

              {passkeyLocalization.addPasskey}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
