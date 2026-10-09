import { Suspense } from "react";
import { RuntimeAppProviders } from "@/components/runtime-app-providers";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Browser auto-translate (Google Translate) rewraps text nodes in <font> and breaks
  // React's DOM updates on the auth forms (insertBefore NotFoundError).
  return (
    <div translate="no" className="contents">
      <Suspense fallback={<div className="min-h-screen" />}>
        <RuntimeAppProviders>{children}</RuntimeAppProviders>
      </Suspense>
    </div>
  );
}
