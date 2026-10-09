import { connection } from "next/server";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers";
import { getPlatformCapabilities } from "@/lib/platform-capabilities.server";

/**
 * Resolves platform capabilities per request instead of at `next build`.
 * Render inside a <Suspense> boundary.
 */
export async function RuntimeAppProviders({ children }: { children: ReactNode }) {
  await connection();
  return <AppProviders platformCapabilities={getPlatformCapabilities()}>{children}</AppProviders>;
}
