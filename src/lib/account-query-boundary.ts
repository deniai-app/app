import { authQueryKeys } from "@better-auth-ui/core";
import { matchQuery, type Query, type QueryClient } from "@tanstack/react-query";

/** Signed-in user id, `null` when signed out, `undefined` while the session is loading. */
export type AccountIdentity = string | null | undefined;

/**
 * Whose state a boundary's mounted children were created for: `"none"` before
 * they first mount, `"pending"` when they mounted while the session was loading,
 * otherwise the resolved identity.
 */
export type ShownIdentity = string | null | "none" | "pending";

/**
 * The account whose data each QueryClient holds. Kept beside the client rather
 * than in a component: the browser client is a singleton that outlives any one
 * provider tree (home, auth and app layouts each mount their own), so a newly
 * mounted boundary must still know whose data is cached.
 */
const owners = new WeakMap<QueryClient, string | null>();

export function getAccountOwner(queryClient: QueryClient): AccountIdentity {
  return owners.has(queryClient) ? owners.get(queryClient) : undefined;
}

/**
 * Better Auth UI's session query is keyed without a user id and is not kept in
 * sync with `authClient.useSession`, so it is only kept when it already holds
 * `identity`'s session.
 */
function isSessionOf(query: Query, identity: string | null) {
  if (!matchQuery({ queryKey: authQueryKeys.session, exact: true }, query)) return false;
  const data = query.state.data as { user?: { id?: unknown } } | null | undefined;
  return identity === null ? data === null : data?.user?.id === identity;
}

/** Whether the cache holds anything not known to belong to `identity`. */
export function hasForeignQueries(queryClient: QueryClient, identity: string | null) {
  return queryClient
    .getQueryCache()
    .getAll()
    .some((query) => !isSessionOf(query, identity));
}

/**
 * What the boundary renders. `owner` is whose data the shared cache holds;
 * `shown` is whose state this boundary's children were created for, which can
 * differ when another boundary on the same client (e.g. a tree kept hidden by
 * Activity) already switched the cache.
 * - `render`: children may render as they are.
 * - `adopt`: render, and record `identity` as the owner of an otherwise empty cache.
 * - `wait`: the session is loading but the cache, or these children, may hold
 *   another account's data; show nothing until it is known.
 * - `reset`: show nothing until the cache is claimed for `identity` and the
 *   children are mounted again with fresh state.
 */
export function decideAccountBoundary({
  owner,
  identity,
  shown,
  foreignQueries,
}: {
  owner: AccountIdentity;
  identity: AccountIdentity;
  shown: ShownIdentity;
  /** `hasForeignQueries` for `identity` (any query at all while it is loading). */
  foreignQueries: boolean;
}): "render" | "adopt" | "wait" | "reset" {
  if (identity === undefined) {
    if (owner === undefined) {
      // Unowned data is only safe for the children that fetched it while loading.
      return shown === "pending" || (shown === "none" && !foreignQueries) ? "render" : "wait";
    }
    return shown === owner ? "render" : "wait";
  }
  if (owner === undefined) {
    if (foreignQueries) return "reset";
    return shown === "none" || shown === "pending" || shown === identity ? "adopt" : "reset";
  }
  if (owner !== identity) return "reset";
  return shown === "none" || shown === identity ? "render" : "reset";
}

/**
 * Drop every cached and in-flight query not known to belong to `identity`,
 * including Better Auth UI's. Most tRPC keys carry no user id, so a later account
 * would otherwise be shown the previous account's chats, and a response still in
 * flight for it would land in the new account's cache.
 */
export function resetAccountQueries(queryClient: QueryClient, identity: string | null) {
  // Cancel everything first: a kept session query may still be fetching for the
  // previous account even though its data was since replaced.
  void queryClient.cancelQueries();
  queryClient.removeQueries({ predicate: (query) => !isSessionOf(query, identity) });
  queryClient.getMutationCache().clear();
}

/** Bumped on every ownership change of a QueryClient. */
const epochs = new WeakMap<QueryClient, number>();

function setOwner(queryClient: QueryClient, identity: string | null) {
  owners.set(queryClient, identity);
  epochs.set(queryClient, (epochs.get(queryClient) ?? 0) + 1);
}

/**
 * Call when a request starts; the returned check stays true only while the
 * cache has the same owner. Clearing the mutation cache does not stop callbacks
 * of mutations already in flight, so cache writes from their results (or from
 * a promise `.then`) must check it, or a previous account's response could be
 * written into the next account's cache.
 */
export function captureAccountEpoch(queryClient: QueryClient) {
  const epoch = epochs.get(queryClient) ?? 0;
  return () => (epochs.get(queryClient) ?? 0) === epoch;
}

/**
 * Record `identity` as the owner of the cache, first dropping anything else it
 * holds: another account's data, or unowned data fetched before the session
 * was known. Does nothing when `identity` already owns it.
 */
export function claimAccountQueries(queryClient: QueryClient, identity: string | null) {
  if (getAccountOwner(queryClient) === identity) return;
  resetAccountQueries(queryClient, identity);
  setOwner(queryClient, identity);
}

/**
 * Record `identity` as the owner of a cache that held nothing foreign when the
 * boundary decided to `adopt`. Queries its children created since are kept.
 */
export function adoptAccountQueries(queryClient: QueryClient, identity: string | null) {
  if (getAccountOwner(queryClient) === undefined) setOwner(queryClient, identity);
}
