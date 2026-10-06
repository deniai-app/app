import { expect, test } from "vitest";
import { type ErrorDictionary, mapKeys, resolveErrorMessage } from "./localize-error";

const dictionary: ErrorDictionary = {
  byCode: {
    ...mapKeys("パスワードが正しくありません", "INVALID_PASSWORD"),
    ...mapKeys("チームが見つかりません", "ORGANIZATION_NOT_FOUND", "TEAM_NOT_FOUND"),
  },
  byMessage: { "Chat not found": "チャットが見つかりません" },
  patterns: [
    {
      pattern: /^Verification not yet authorized \(status: (.+)\)\.$/,
      format: ([, status]) => `未承認（${status}）`,
    },
  ],
  byTrpcCode: { UNAUTHORIZED: "ログインが必要です", NOT_FOUND: "見つかりません" },
  network: "ネットワークエラー",
  invalidInput: "入力エラー",
};

const resolve = (error: unknown, fallback?: string) =>
  resolveErrorMessage(error, dictionary, fallback);

test("translates better-auth errors by code, including wrapped results", () => {
  expect(resolve({ code: "INVALID_PASSWORD", message: "Invalid password" })).toBe(
    "パスワードが正しくありません",
  );
  expect(resolve({ error: { code: "TEAM_NOT_FOUND", message: "Team not found" } })).toBe(
    "チームが見つかりません",
  );
});

test("translates tRPC errors by exact message", () => {
  const error = Object.assign(new Error("Chat not found"), { data: { code: "NOT_FOUND" } });
  expect(resolve(error)).toBe("チャットが見つかりません");
});

test("uses the tRPC code only when the server sent no message of its own", () => {
  const bare = Object.assign(new Error("UNAUTHORIZED"), { data: { code: "UNAUTHORIZED" } });
  expect(resolve(bare)).toBe("ログインが必要です");

  const custom = Object.assign(new Error("Only owners can do that"), {
    data: { code: "UNAUTHORIZED" },
  });
  expect(resolve(custom)).toBe("Only owners can do that");
});

test("reports tRPC input validation failures as one message", () => {
  const zodJson = JSON.stringify([{ code: "too_small", message: "Too short", path: ["name"] }]);
  expect(resolve(Object.assign(new Error(zodJson), { data: { code: "BAD_REQUEST" } }))).toBe(
    "入力エラー",
  );
  expect(resolve(new Error("x"), "fallback")).toBe("x");
});

test("translates network failures and keeps unknown messages unchanged", () => {
  expect(resolve(new TypeError("Failed to fetch"))).toBe("ネットワークエラー");
  expect(resolve(new Error("Something odd"))).toBe("Something odd");
  expect(resolve({ code: "NOT_IN_TABLE", message: "Custom failure" })).toBe("Custom failure");
});

test("falls back when the error carries no message", () => {
  expect(resolve(undefined, "fallback")).toBe("fallback");
  expect(resolve({}, "fallback")).toBe("fallback");
  expect(resolve("plain string")).toBe("plain string");
});

test("rebuilds messages that carry a variable part", () => {
  expect(resolve(new Error("Verification not yet authorized (status: requires_action)."))).toBe(
    "未承認（requires_action）",
  );
});
