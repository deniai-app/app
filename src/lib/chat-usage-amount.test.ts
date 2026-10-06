import { expect, test } from "vitest";
import { calculateChatUsageAmount, resolveFinalChatUsageAmount } from "./chat-usage-amount";
import { getEffectiveTokenMultiplier } from "./constants";

const model = "gpt-6-luna";

test("ten 30K requests do not become one 300K long-context request", () => {
  const stepUsage = { inputTokens: 30_000, outputTokens: 100 };
  const sum = Array.from({ length: 10 }, () => calculateChatUsageAmount(model, stepUsage)).reduce(
    (total, amount) => total + amount,
    0,
  );
  const totalUsage = { inputTokens: 300_000, outputTokens: 1_000 };
  expect(sum).toBe(305_000 * getEffectiveTokenMultiplier(model));
  expect(resolveFinalChatUsageAmount(sum, model, totalUsage)).toBe(sum);
  expect(calculateChatUsageAmount(model, totalUsage)).toBe(sum * 2);
});

test("one 250K request receives the long-context premium", () => {
  const usage = { inputTokens: 250_000, outputTokens: 100 };
  expect(calculateChatUsageAmount(model, usage)).toBe(
    250_500 * getEffectiveTokenMultiplier(model) * 2,
  );
});

test("total usage is a fallback when steps reported no usage", () => {
  const usage = { inputTokens: 250_000, outputTokens: 100 };
  expect(resolveFinalChatUsageAmount(0, model, usage)).toBe(calculateChatUsageAmount(model, usage));
});

test("cached input counts toward the request's context threshold", () => {
  const usage = {
    inputTokens: 250_000,
    outputTokens: 0,
    inputTokenDetails: { noCacheTokens: 50_000, cacheReadTokens: 200_000 },
  };
  expect(calculateChatUsageAmount(model, usage)).toBe(
    70_000 * getEffectiveTokenMultiplier(model) * 2,
  );
});

test("Pro and Fast mode multipliers are preserved", () => {
  const usage = { inputTokens: 30_000, outputTokens: 100 };
  const options = { proMode: true, fastMode: true };
  expect(calculateChatUsageAmount(model, usage, options)).toBe(
    30_500 * getEffectiveTokenMultiplier(model, 30_000, options),
  );
});
