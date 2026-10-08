import { authQueryKeys } from "@better-auth-ui/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import {
  type AccountIdentity,
  adoptAccountQueries,
  captureAccountEpoch,
  claimAccountQueries,
  decideAccountBoundary,
  getAccountOwner,
  hasForeignQueries,
  type ShownIdentity,
} from "./account-query-boundary";

const session = vi.hoisted(() => ({ identity: undefined as string | null | undefined }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () =>
      session.identity === undefined
        ? { data: null, isPending: true }
        : { data: session.identity ? { user: { id: session.identity } } : null, isPending: false },
  },
}));

const { AccountBoundary } = await import("@/components/account-boundary");

const chatsKey = [["chat", "getChats"], { type: "query" }];

function client() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
}

/** Server-render a freshly mounted boundary (render-phase decisions only; no effects run). */
function renderBoundary(queryClient: QueryClient, identity: AccountIdentity) {
  session.identity = identity;
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AccountBoundary, null, createElement("main", null, "private chats")),
    ),
  );
}

/**
 * One boundary instance across renders: its decision, then what its layout
 * effect does (mirrors AccountBoundary), so separate instances can share a client.
 */
function boundary(queryClient: QueryClient) {
  let shown: ShownIdentity = "none";
  let generation = 0;
  return {
    get generation() {
      return generation;
    },
    render(identity: AccountIdentity) {
      const decision = decideAccountBoundary({
        owner: getAccountOwner(queryClient),
        identity,
        shown,
        foreignQueries:
          identity === undefined
            ? queryClient.getQueryCache().getAll().length > 0
            : hasForeignQueries(queryClient, identity),
      });
      if (decision === "wait") return decision;
      if (identity === undefined) {
        if (shown === "none") shown = "pending";
      } else if (decision === "reset") {
        claimAccountQueries(queryClient, identity);
        shown = identity;
        generation += 1;
      } else {
        if (decision === "adopt") adoptAccountQueries(queryClient, identity);
        shown = identity;
      }
      return decision;
    },
  };
}

beforeEach(() => {
  session.identity = undefined;
});

test("public pages still server-render while the session is unknown", () => {
  expect(renderBoundary(client(), undefined)).toContain("private chats");
  expect(renderBoundary(client(), null)).toContain("private chats");
});

test("ownership outlives a provider tree, so a remount cannot adopt another account's cache", () => {
  const queryClient = client();
  // App layout: account A loads its chats.
  expect(boundary(queryClient).render("user-a")).toBe("adopt");
  queryClient.setQueryData(chatsKey, [{ id: "a-chat", title: "Account A secret" }]);

  // The app layout unmounts (e.g. navigating to home); a new boundary mounts with
  // the session still loading. It must not show A's cache to an unknown session.
  expect(renderBoundary(queryClient, undefined)).toBe("");

  // The session resolves to B (switched in another tab): nothing renders until the
  // switch is applied, then A's data is gone and B starts from an empty cache.
  expect(renderBoundary(queryClient, "user-b")).toBe("");
  expect(boundary(queryClient).render("user-b")).toBe("reset");
  expect(getAccountOwner(queryClient)).toBe("user-b");
  expect(queryClient.getQueryData(chatsKey)).toBeUndefined();
  expect(renderBoundary(queryClient, "user-b")).toContain("private chats");
});

test("the same account keeps its cache and mounted state across refreshes and remounts", () => {
  const queryClient = client();
  const tree = boundary(queryClient);
  tree.render("user-a");
  queryClient.setQueryData(chatsKey, ["a-chat"]);

  expect(tree.render("user-a")).toBe("render");
  expect(tree.generation).toBe(0);
  expect(boundary(queryClient).render("user-a")).toBe("render");
  expect(renderBoundary(queryClient, "user-a")).toContain("private chats");
  expect(queryClient.getQueryData(chatsKey)).toEqual(["a-chat"]);
});

test("sign-out and the next sign-in each drop the previous account's data", async () => {
  const queryClient = client();
  const tree = boundary(queryClient);
  tree.render("user-a");
  queryClient.setQueryData(chatsKey, ["a-chat"]);

  expect(tree.render(null)).toBe("reset");
  expect(queryClient.getQueryData(chatsKey)).toBeUndefined();

  queryClient.setQueryData(["public"], "signed-out data");
  expect(tree.render("user-b")).toBe("reset");
  expect(tree.generation).toBe(2);
  expect(queryClient.getQueryData(["public"])).toBeUndefined();

  let fetchedForB = false;
  const visible = await queryClient.fetchQuery({
    queryKey: chatsKey,
    queryFn: async () => {
      fetchedForB = true;
      return ["b-chat"];
    },
  });
  expect(fetchedForB).toBe(true);
  expect(visible).toEqual(["b-chat"]);
});

test("a response still in flight for the previous account never reaches the next one", async () => {
  const queryClient = client();
  boundary(queryClient).render("user-a");
  let resolveA: (value: unknown) => void = () => {};
  const inFlightForA = queryClient
    .fetchQuery({
      queryKey: chatsKey,
      queryFn: () => new Promise((resolve) => (resolveA = resolve)),
    })
    .catch(() => undefined);

  boundary(queryClient).render("user-b");
  resolveA(["a-chat"]);
  await inFlightForA;

  expect(queryClient.getQueryData(chatsKey)).toBeUndefined();
  expect(queryClient.getQueryCache().findAll({ queryKey: chatsKey })).toEqual([]);
});

test("Better Auth UI's unscoped session query never carries A into B", () => {
  const queryClient = client();
  const tree = boundary(queryClient);
  tree.render("user-a");
  // authClient.signOut()/another tab does not update Better Auth UI's query.
  queryClient.setQueryData(authQueryKeys.session, { user: { id: "user-a" } });
  queryClient.setQueryData([...authQueryKeys.all, "listAccounts"], ["a-account"]);

  expect(tree.render("user-b")).toBe("reset");
  expect(queryClient.getQueryData(authQueryKeys.session)).toBeUndefined();
  expect(queryClient.getQueryData([...authQueryKeys.all, "listAccounts"])).toBeUndefined();

  // B's own hydrated session survives a later claim for B.
  queryClient.setQueryData(authQueryKeys.session, { user: { id: "user-b" } });
  expect(tree.render("user-b")).toBe("render");
  expect(queryClient.getQueryData(authQueryKeys.session)).toEqual({ user: { id: "user-b" } });
});

test("a tree kept hidden with A's state remounts for B even after another boundary claimed B", () => {
  const queryClient = client();
  const hidden = boundary(queryClient);
  expect(hidden.render("user-a")).toBe("adopt");
  queryClient.setQueryData(chatsKey, ["a-chat"]);

  const visible = boundary(queryClient);
  expect(visible.render("user-b")).toBe("reset");
  expect(getAccountOwner(queryClient)).toBe("user-b");
  queryClient.setQueryData(chatsKey, ["b-chat"]);

  // The cache is already B's, but the hidden tree's children still hold A's state.
  const before = hidden.generation;
  expect(hidden.render("user-b")).toBe("reset");
  expect(hidden.generation).toBe(before + 1);
  // B's cache is not dropped for a purely local remount.
  expect(queryClient.getQueryData(chatsKey)).toEqual(["b-chat"]);
  expect(hidden.render("user-b")).toBe("render");
});

test("queries run while the session loads are dropped before the first account adopts the cache", async () => {
  const queryClient = client();
  const tree = boundary(queryClient);
  expect(tree.render(undefined)).toBe("render");
  queryClient.setQueryData(chatsKey, ["fetched before the session resolved"]);
  let resolveUnowned: (value: unknown) => void = () => {};
  const inFlight = queryClient
    .fetchQuery({
      queryKey: ["usage"],
      queryFn: () => new Promise((resolve) => (resolveUnowned = resolve)),
    })
    .catch(() => undefined);

  // The children that fetched it may keep rendering while still loading...
  expect(tree.render(undefined)).toBe("render");
  // ...but a newly mounted boundary must not see unowned data.
  expect(boundary(queryClient).render(undefined)).toBe("wait");
  expect(renderBoundary(queryClient, undefined)).toBe("");

  expect(tree.render("user-b")).toBe("reset");
  resolveUnowned("late");
  await inFlight;
  expect(queryClient.getQueryCache().getAll()).toEqual([]);
  expect(getAccountOwner(queryClient)).toBe("user-b");
});

test("the first account adopts an empty cache without remounting", () => {
  const queryClient = client();
  const tree = boundary(queryClient);
  tree.render(undefined);
  queryClient.setQueryData(authQueryKeys.session, { user: { id: "user-b" } });

  expect(tree.render("user-b")).toBe("adopt");
  expect(tree.generation).toBe(0);
  expect(queryClient.getQueryData(authQueryKeys.session)).toEqual({ user: { id: "user-b" } });
});

test("decisions for owner, session and mounted-state combinations", () => {
  const decide = (
    owner: AccountIdentity,
    identity: AccountIdentity,
    shown: ShownIdentity,
    foreignQueries = false,
  ) => decideAccountBoundary({ owner, identity, shown, foreignQueries });

  expect(decide(undefined, undefined, "none")).toBe("render");
  expect(decide(undefined, undefined, "none", true)).toBe("wait");
  expect(decide(undefined, undefined, "pending", true)).toBe("render");
  expect(decide("user-a", undefined, "none")).toBe("wait");
  expect(decide("user-a", undefined, "user-a")).toBe("render");
  expect(decide(null, undefined, "none")).toBe("wait");
  expect(decide(undefined, "user-a", "none")).toBe("adopt");
  expect(decide(undefined, "user-a", "pending", true)).toBe("reset");
  expect(decide("user-a", "user-a", "user-a")).toBe("render");
  expect(decide("user-a", "user-a", "none")).toBe("render");
  expect(decide("user-b", "user-b", "user-a")).toBe("reset");
  expect(decide("user-b", "user-b", "pending")).toBe("reset");
  expect(decide(null, null, null)).toBe("render");
  expect(decide("user-a", null, "user-a")).toBe("reset");
  expect(decide(null, "user-b", null)).toBe("reset");
  expect(decide("user-a", "user-b", "user-a")).toBe("reset");
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

test("a session fetch still in flight for A cannot overwrite B's session after a switch", async () => {
  const queryClient = client();
  claimAccountQueries(queryClient, "user-a");
  const sessionForA = deferred<unknown>();
  const inFlight = queryClient
    .fetchQuery({ queryKey: authQueryKeys.session, queryFn: () => sessionForA.promise })
    .catch(() => undefined);
  // Hydration replaces the data while A's fetch is still running.
  queryClient.setQueryData(authQueryKeys.session, { user: { id: "user-b" } });

  claimAccountQueries(queryClient, "user-b");
  sessionForA.resolve({ user: { id: "user-a" } });
  await inFlight;

  expect(queryClient.getQueryData(authQueryKeys.session)).not.toEqual({ user: { id: "user-a" } });
});

/** A mutation like ChatRouteHost's ensureChat: its onSuccess writes the returned chat. */
function ensureChatMutation(queryClient: QueryClient, response: Promise<string[]>) {
  return queryClient
    .getMutationCache()
    .build(queryClient, {
      mutationFn: () => response,
      onMutate: () => captureAccountEpoch(queryClient),
      onSuccess: (row, _variables, isSameAccount) => {
        if (isSameAccount()) queryClient.setQueryData(chatsKey, row);
      },
    })
    .execute(undefined);
}

test("a mutation in flight for A cannot write its result after the cache switches to B", async () => {
  const queryClient = client();
  claimAccountQueries(queryClient, "user-a");
  const responseForA = deferred<string[]>();
  const mutation = ensureChatMutation(queryClient, responseForA.promise);
  await Promise.resolve();

  // Clearing the mutation cache alone does not stop the callback.
  claimAccountQueries(queryClient, "user-b");
  responseForA.resolve(["Account A confidential transcript"]);
  await mutation;

  expect(queryClient.getQueryData(chatsKey)).toBeUndefined();
});

test("a promise result for A is dropped even when the account returns to A", async () => {
  const queryClient = client();
  claimAccountQueries(queryClient, "user-a");
  const responseForA = deferred<string[]>();
  // Like useNewChat: ensureChat.mutate().then(write).
  const isSameAccount = captureAccountEpoch(queryClient);
  const written = responseForA.promise.then((row) => {
    if (isSameAccount()) queryClient.setQueryData(chatsKey, row);
  });

  claimAccountQueries(queryClient, "user-b");
  claimAccountQueries(queryClient, "user-a");
  responseForA.resolve(["stale A chat"]);
  await written;

  expect(queryClient.getQueryData(chatsKey)).toBeUndefined();
});

test("results for the same account still land after a session refresh", async () => {
  const queryClient = client();
  const tree = boundary(queryClient);
  tree.render("user-a");
  const response = deferred<string[]>();
  const mutation = ensureChatMutation(queryClient, response.promise);
  await Promise.resolve();

  expect(tree.render("user-a")).toBe("render");
  claimAccountQueries(queryClient, "user-a");
  response.resolve(["a-chat"]);
  await mutation;

  expect(queryClient.getQueryData(chatsKey)).toEqual(["a-chat"]);
});
