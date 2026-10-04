"use client";

import { useAuth, useChangeEmail, useSession } from "@better-auth-ui/react";
import { useExtracted } from "next-intl";
import { type SyntheticEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ChangeEmailProps = {
  className?: string;
};

/**
 * Render a card containing a form to view and update the authenticated user's email.
 *
 * Shows a loading skeleton until session data is available and displays the current
 * email as the form's default value. On submit, a verified account receives a
 * confirmation link at its current address first (the new address is verified
 * afterwards); an unverified account receives a verification link at the new address.
 *
 * @returns A JSX element rendering the change-email card and form
 */
export function ChangeEmail({ className }: ChangeEmailProps) {
  const { authClient, baseURL, basePaths, localization, viewPaths } = useAuth();
  const { data: session } = useSession(authClient);
  const t = useExtracted();

  const { mutate: changeEmail, isPending } = useChangeEmail(authClient, {
    onSuccess: () =>
      toast.success(
        session?.user.emailVerified
          ? t(
              "Check your current email address to approve the change. We'll then send a verification link to the new address.",
            )
          : localization.settings.changeEmailSuccess,
      ),
  });

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
  }>({});

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    changeEmail({
      newEmail: formData.get("email") as string,
      // Both email links (confirmation and verification) return to account settings.
      callbackURL: `${baseURL}${basePaths.settings}/${viewPaths.settings.account}`,
    });
  }

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">{localization.settings.changeEmail}</h2>

      <form onSubmit={handleSubmit}>
        <Card className={cn(className)}>
          <CardContent className="flex flex-col gap-6">
            <Field data-invalid={!!fieldErrors.email}>
              <Label htmlFor="email">{localization.auth.email}</Label>

              {session ? (
                <Input
                  key={session?.user.email}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={session?.user.email}
                  placeholder={localization.auth.emailPlaceholder}
                  disabled={isPending}
                  required
                  onChange={() => {
                    setFieldErrors((prev) => ({
                      ...prev,
                      email: undefined,
                    }));
                  }}
                  onInvalid={(e) => {
                    e.preventDefault();
                    setFieldErrors((prev) => ({
                      ...prev,
                      email: (e.target as HTMLInputElement).validationMessage,
                    }));
                  }}
                  aria-invalid={!!fieldErrors.email}
                />
              ) : (
                <Skeleton>
                  <Input className="invisible" />
                </Skeleton>
              )}

              <FieldError>{fieldErrors.email}</FieldError>
            </Field>
          </CardContent>

          <CardFooter>
            <Button type="submit" size="sm" disabled={isPending || !session}>
              {isPending && <Spinner />}

              {localization.settings.updateEmail}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
