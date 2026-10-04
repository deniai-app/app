import { AppProviders } from "@/components/providers";
import { platformCapabilities } from "@/lib/platform-capabilities.server";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Browser auto-translate (Google Translate) rewraps text nodes in <font> and breaks
  // React's DOM updates on the auth forms (insertBefore NotFoundError).
  return (
    <div translate="no" className="contents">
      <AppProviders platformCapabilities={platformCapabilities}>{children}</AppProviders>
    </div>
  );
}
