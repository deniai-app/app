"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Fragment, type ReactNode, useLayoutEffect, useState } from "react";
import {
  adoptAccountQueries,
  claimAccountQueries,
  decideAccountBoundary,
  getAccountOwner,
  hasForeignQueries,
  type ShownIdentity,
} from "@/lib/account-query-boundary";
import { authClient } from "@/lib/auth-client";

/**
 * Keeps one account's cached queries and mounted component state away from the
 * next one. Ownership is recorded per QueryClient, so it survives this provider
 * tree unmounting (home, auth and app layouts mount separate trees around the
 * same browser client), and each boundary also remembers whose state its own
 * children hold, since a tree kept hidden by Activity can render again after
 * another boundary has already switched the cache.
 *
 * Nothing is rendered while a different identity, or a still-loading session,
 * would see another account's cache. On a switch (sign-out, sign-in, another
 * account, a change made in another tab), or when the session first resolves
 * after queries ran unowned, those queries are cancelled and removed, then the
 * tree mounts again with fresh state. The same account refreshing its session
 * keeps everything.
 */
export function AccountBoundary({ children }: { children: ReactNode }) {
  // Reads the owner and cache contents, which live outside React; the compiler
  // would otherwise reuse a decision made for the same props and state.
  "use no memo";
  const queryClient = useQueryClient();
  const { data, isPending } = authClient.useSession();
  const identity = isPending ? undefined : (data?.user.id ?? null);
  const [mounted, setMounted] = useState<{ shown: ShownIdentity; generation: number }>({
    shown: "none",
    generation: 0,
  });
  const decision = decideAccountBoundary({
    owner: getAccountOwner(queryClient),
    identity,
    shown: mounted.shown,
    foreignQueries:
      identity === undefined
        ? queryClient.getQueryCache().getAll().length > 0
        : hasForeignQueries(queryClient, identity),
  });

  useLayoutEffect(() => {
    if (decision === "wait") return;
    if (identity === undefined) {
      // Children mounted while loading: their data is unowned until it resolves.
      if (mounted.shown === "none")
        setMounted({ shown: "pending", generation: mounted.generation });
      return;
    }
    if (decision === "reset") {
      // Children are not rendered for a reset, so nothing can still observe the
      // dropped queries and their state starts fresh.
      claimAccountQueries(queryClient, identity);
      setMounted({ shown: identity, generation: mounted.generation + 1 });
      return;
    }
    if (decision === "adopt") adoptAccountQueries(queryClient, identity);
    if (mounted.shown !== identity) setMounted({ shown: identity, generation: mounted.generation });
  }, [decision, identity, mounted, queryClient]);

  if (decision === "wait" || decision === "reset") return null;
  return <Fragment key={mounted.generation}>{children}</Fragment>;
}
