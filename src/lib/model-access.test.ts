import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  getModelsForGuest,
  getModelsForPlanTier,
  isFreePlanModel,
  isModelAllowedForAccount,
  models,
} from "./constants";

describe("model access", () => {
  const restrictedModel = models.find((model) => !isFreePlanModel(model.value));

  test("unverified free accounts only see the free catalog", () => {
    assert.ok(restrictedModel);
    assert.deepEqual(
      getModelsForPlanTier("free"),
      models.filter((model) => isFreePlanModel(model.value)),
    );
    assert.equal(isModelAllowedForAccount(restrictedModel.value, "free"), false);
  });

  test("verified free accounts and paid accounts can use the full catalog", () => {
    assert.ok(restrictedModel);
    assert.deepEqual(getModelsForPlanTier("free", true), models);
    assert.deepEqual(getModelsForPlanTier("plus"), models);
    assert.equal(isModelAllowedForAccount(restrictedModel.value, "free", true), true);
  });

  test("guest catalog remains restricted", () => {
    assert.deepEqual(
      getModelsForGuest().map((model) => model.value),
      ["gpt-6-luna"],
    );
  });
});
