import { ensureSessionServer } from "@better-auth-ui/core/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { connection } from "next/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Settings } from "@/components/auth/settings/settings";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { Spinner } from "@/components/ui/spinner";
import { auth } from "@/lib/auth";
import { getQueryClient } from "@/lib/query-client";

/** Matches AuthProvider viewPaths.settings override (account → "settings"). */
const ACCOUNT_SETTINGS_PATHS = ["settings", "security"] as const;

function AccountPageFallback() {
  return (
    <main className="flex min-h-[50vh] items-center justify-center pt-24" id="main-content">
      <Spinner className="size-5" />
    </main>
  );
}

type AccountPageProps = {
  params: Promise<{ path: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function AccountPageContent({ params, searchParams }: AccountPageProps) {
  // Defer session/DB work past Cache Components prerender (request-time only).
  await connection();

  const { path } = await params;

  if (!(ACCOUNT_SETTINGS_PATHS as readonly string[]).includes(path)) {
    notFound();
  }

  const requestHeaders = await headers();
  const queryClient = getQueryClient();

  const session = await ensureSessionServer(queryClient, auth, {
    headers: requestHeaders,
  });

  if (!session) {
    // Email links can land here signed out; keep their ?error= so the result is
    // still shown after signing in.
    const { error } = await searchParams;
    const returnTo =
      typeof error === "string"
        ? `/account/${path}?${new URLSearchParams({ error }).toString()}`
        : `/account/${path}`;
    redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <main className="pt-24" id="main-content">
        <Header />
        <div className="mx-auto w-full max-w-3xl px-8 pb-12">
          <Settings path={path} />
        </div>
        <Footer />
      </main>
    </HydrationBoundary>
  );
}

export default function AccountPage({ params, searchParams }: AccountPageProps) {
  return (
    <Suspense fallback={<AccountPageFallback />}>
      <AccountPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
