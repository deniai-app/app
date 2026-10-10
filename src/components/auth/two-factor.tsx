"use client";

import { useAuth } from "@better-auth-ui/react";
import { useExtracted } from "next-intl";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { runWithLoading } from "@/lib/run-with-loading";
import { cn } from "@/lib/utils";

export type TwoFactorProps = {
  className?: string;
};

type VerifyMode = "totp" | "backup";

/**
 * Second-factor verification after email/password sign-in when 2FA is enabled.
 * Accepts a TOTP code from an authenticator app, or a one-time backup code.
 */
export function TwoFactor({ className }: TwoFactorProps) {
  const t = useExtracted();
  const { basePaths, redirectTo, viewPaths, navigate, Link } = useAuth();

  const [mode, setMode] = useState<VerifyMode>("totp");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  const signInHref = `${basePaths.auth}/${viewPaths.auth.signIn}`;

  const completeSignIn = () => {
    navigate({ to: redirectTo, replace: true });
  };

  const handleError = (message?: string) => {
    setError(message || t("Invalid verification code"));
    setTotpCode("");
    setBackupCode("");
  };

  const verifyTotp = (code: string) => {
    if (code.length !== 6 || isPending) return;

    void runWithLoading(setIsPending, async () => {
      setError(undefined);

      const { error: verifyError } = await authClient.twoFactor.verifyTotp({
        code,
        trustDevice,
      });

      if (verifyError) {
        handleError(verifyError.message);
        return;
      }

      toast.success(t("Signed in successfully"));
      completeSignIn();
    });
  };

  const verifyBackup = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = backupCode.trim();
    if (!code || isPending) return;

    void runWithLoading(setIsPending, async () => {
      setError(undefined);

      const { error: verifyError } = await authClient.twoFactor.verifyBackupCode({
        code,
        trustDevice,
      });

      if (verifyError) {
        handleError(verifyError.message);
        return;
      }

      toast.success(t("Signed in successfully"));
      completeSignIn();
    });
  };

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{t("Two-factor authentication")}</CardTitle>
        <CardDescription>
          {mode === "totp"
            ? t("Enter the 6-digit code from your authenticator app")
            : t("Enter one of your backup recovery codes")}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-6">
          {mode === "totp" ? (
            <FieldGroup>
              <Field data-invalid={!!error}>
                <Label htmlFor="totp-code">{t("Authentication code")}</Label>
                <div className="flex justify-center">
                  <InputOTP
                    id="totp-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={(value) => {
                      setTotpCode(value);
                      setError(undefined);
                      if (value.length === 6) {
                        void verifyTotp(value);
                      }
                    }}
                    disabled={isPending}
                    autoFocus
                    containerClassName="gap-2"
                    aria-invalid={!!error}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <FieldError>{error}</FieldError>
              </Field>

              <Field className="my-1">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="trustDevice-totp"
                    checked={trustDevice}
                    onCheckedChange={(checked) => setTrustDevice(checked === true)}
                    disabled={isPending}
                  />
                  <Label htmlFor="trustDevice-totp" className="cursor-pointer text-sm font-normal">
                    {t("Trust this device for 30 days")}
                  </Label>
                </div>
              </Field>

              <Button
                type="button"
                disabled={isPending || totpCode.length !== 6}
                onClick={() => void verifyTotp(totpCode)}
              >
                {isPending && <Spinner />}
                {t("Verify")}
              </Button>
            </FieldGroup>
          ) : (
            <form onSubmit={(e) => void verifyBackup(e)}>
              <FieldGroup>
                <Field data-invalid={!!error}>
                  <Label htmlFor="backup-code">{t("Backup code")}</Label>
                  <Input
                    id="backup-code"
                    name="backupCode"
                    type="text"
                    autoComplete="one-time-code"
                    value={backupCode}
                    onChange={(e) => {
                      setBackupCode(e.target.value);
                      setError(undefined);
                    }}
                    placeholder={t("Enter backup code")}
                    required
                    disabled={isPending}
                    autoFocus
                    aria-invalid={!!error}
                  />
                  <FieldError>{error}</FieldError>
                </Field>

                <Field className="my-1">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="trustDevice-backup"
                      checked={trustDevice}
                      onCheckedChange={(checked) => setTrustDevice(checked === true)}
                      disabled={isPending}
                    />
                    <Label
                      htmlFor="trustDevice-backup"
                      className="cursor-pointer text-sm font-normal"
                    >
                      {t("Trust this device for 30 days")}
                    </Label>
                  </div>
                </Field>

                <Button type="submit" disabled={isPending || !backupCode.trim()}>
                  {isPending && <Spinner />}
                  {t("Verify")}
                </Button>
              </FieldGroup>
            </form>
          )}

          <div className="flex flex-col gap-3 items-center w-full">
            <button
              type="button"
              className="text-sm underline-offset-4 hover:underline text-muted-foreground"
              disabled={isPending}
              onClick={() => {
                setMode(mode === "totp" ? "backup" : "totp");
                setError(undefined);
                setTotpCode("");
                setBackupCode("");
              }}
            >
              {mode === "totp"
                ? t("Use a backup code instead")
                : t("Use authenticator app instead")}
            </button>

            <FieldDescription className="text-center">
              <Link href={signInHref} className="underline underline-offset-4">
                {t("Back to sign in")}
              </Link>
            </FieldDescription>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
