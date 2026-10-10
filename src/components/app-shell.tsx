"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatRouteHost } from "@/components/chat/chat-route-host";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useNewChat } from "@/hooks/use-new-chat";

const ChatSearch = dynamic(
  () => import("@/components/chat/chat-search").then((mod) => mod.ChatSearch),
  { loading: () => null },
);
const TwoFactorBanner = dynamic(
  () => import("@/components/two-factor-banner").then((mod) => mod.TwoFactorBanner),
  { loading: () => null },
);
const FlashOfferStrip = dynamic(
  () => import("@/components/billing/flash-offer-strip").then((mod) => mod.FlashOfferStrip),
  { loading: () => null },
);

export function AppShell({ children }: { children: React.ReactNode }) {
  // Track which pathname the dialog was opened for so navigation closes it
  // without a setState-in-effect (React Compiler / cascading render rule).
  const pathname = usePathname();
  const [chatSearchPath, setChatSearchPath] = useState<string | null>(null);
  const isChatSearchOpen = chatSearchPath === pathname;
  const startNewChat = useNewChat();

  const setIsChatSearchOpen = (open: boolean) => {
    setChatSearchPath(open ? pathname : null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const role = target?.getAttribute("role");
      const isEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          role === "textbox");
      if (isEditable) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "k") {
        e.preventDefault();
        setChatSearchPath(pathname);
      }
      if (mod && key === "n") {
        e.preventDefault();
        startNewChat();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pathname, startNewChat]);

  return (
    <SidebarProvider>
      {isChatSearchOpen ? <ChatSearch open onOpenChange={setIsChatSearchOpen} /> : null}
      <AppSidebar onOpenChatSearch={() => setIsChatSearchOpen(true)} />
      <SidebarInset>
        <TwoFactorBanner />
        <FlashOfferStrip />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          {/* Chat routes: SPA host. Everything else: normal RSC children. */}
          <ChatRouteHost>{children}</ChatRouteHost>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
