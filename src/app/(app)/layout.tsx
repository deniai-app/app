import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RuntimeAppProviders } from "@/components/runtime-app-providers";
import { Spinner } from "@/components/ui/spinner";
import { getSession } from "@/lib/get-session";

/** Content-area only — AppShell (sidebar) stays visible while auth resolves. */
function AppContentFallback() {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center">
      <Spinner className="size-5" />
    </div>
  );
}

async function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.session) {
    redirect("/auth/sign-in?redirectTo=/chat");
  }
  return children;
}

/**
 * App chrome (sidebar) is outside auth Suspense so chat list navigation keeps
 * the shell mounted. Nested /chat/[id] owns its own Suspense + skeleton.
 * Navigations between recent chats may also restore via Activity without
 * re-fetching the pane.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppContentFallback />}>
      <RuntimeAppProviders>
        <AppShell>
          <Suspense fallback={<AppContentFallback />}>
            <RequireAuth>{children}</RequireAuth>
          </Suspense>
        </AppShell>
      </RuntimeAppProviders>
    </Suspense>
  );
}
