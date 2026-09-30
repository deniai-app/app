"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ThemePresetProvider } from "@/hooks/use-theme-preset";
import type { PlatformCapabilities } from "@/lib/platform-capabilities";
import { getQueryClient } from "@/lib/query-client";
import { makeTRPCClient } from "@/lib/trpc/client";
import { trpc } from "@/lib/trpc/react";
import { PlatformCapabilitiesProvider } from "./platform-capabilities-provider";
import { ServiceWorkerRegistration } from "./pwa/service-worker-registration";
import { TooltipProvider } from "./ui/tooltip";

const trpcClient = makeTRPCClient();

/**
 * Shared client infrastructure that does not require Better Auth UI.
 *
 * AppProviders composes this with authentication views and plugins for app routes.
 */
export function CommonProviders({
  children,
  platformCapabilities,
  queryClient: providedQueryClient,
}: {
  children: ReactNode;
  platformCapabilities: PlatformCapabilities;
  queryClient?: QueryClient;
}) {
  const queryClient = providedQueryClient ?? getQueryClient();

  return (
    <PlatformCapabilitiesProvider value={platformCapabilities}>
      <ThemePresetProvider>
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <trpc.Provider client={trpcClient} queryClient={queryClient}>
              {children}
            </trpc.Provider>
          </QueryClientProvider>
        </TooltipProvider>
      </ThemePresetProvider>
      <ServiceWorkerRegistration />
    </PlatformCapabilitiesProvider>
  );
}
