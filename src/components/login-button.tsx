"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { GuestSignInButton } from "@/components/guest-sign-in-button";
import { Button } from "@/components/ui/button";

export function LoginButton() {
  const t = useExtracted();

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button size="lg" className="group" render={<Link href="/chat" />} nativeButton={false}>
        {t("Get Started")}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </Button>
      <GuestSignInButton />
    </div>
  );
}
