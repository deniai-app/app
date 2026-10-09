import { Suspense } from "react";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { RuntimeAppProviders } from "@/components/runtime-app-providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <RuntimeAppProviders>
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </RuntimeAppProviders>
    </Suspense>
  );
}
