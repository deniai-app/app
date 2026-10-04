"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Last-resort boundary for errors thrown by the root layout. Keep it dependency-free. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem" }}>
        <h1>Something went wrong</h1>
        <p>An unexpected error occurred. Please reload the page.</p>
      </body>
    </html>
  );
}
