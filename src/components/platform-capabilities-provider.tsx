"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlatformCapabilities } from "@/lib/platform-capabilities";

const defaultCapabilities: PlatformCapabilities = {
  models: {
    openai: true,
    anthropic: true,
    google: true,
    xai: true,
    deni: true,
  },
  features: {
    webSearch: true,
    memory: true,
    billing: true,
  },
  auth: {
    socialProviders: ["google", "github"],
    captcha: true,
  },
};

const PlatformCapabilitiesContext = createContext<PlatformCapabilities>(defaultCapabilities);

export function PlatformCapabilitiesProvider({
  value,
  children,
}: {
  value: PlatformCapabilities;
  children: ReactNode;
}) {
  return (
    <PlatformCapabilitiesContext.Provider value={value}>
      {children}
    </PlatformCapabilitiesContext.Provider>
  );
}

export function usePlatformCapabilities(): PlatformCapabilities {
  return useContext(PlatformCapabilitiesContext);
}
