"use client";

import { useEffect } from "react";

export const APP_NAME = "Deni AI";

/**
 * Sets document.title for client-driven routes (chat host, settings) where
 * metadata can't be per-request localized under cacheComponents.
 * Pass no `title` for the bare app name; otherwise renders "{title} | Deni AI".
 */
export function DocumentTitle({ title }: { title?: string | null }) {
  const trimmed = title?.trim();
  const next = trimmed ? `${trimmed} | ${APP_NAME}` : APP_NAME;

  useEffect(() => {
    const previous = document.title;
    document.title = next;
    return () => {
      if (document.title === next) {
        document.title = previous;
      }
    };
  }, [next]);

  return null;
}
