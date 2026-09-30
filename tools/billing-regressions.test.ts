import { describe, expect, test } from "vitest";
import { billingPlans, getPlanTier, isIndividualPlanId, isTeamPlanId } from "../src/lib/billing";

describe("billing plan ID guards", () => {
  test("classify every registered plan according to its tier", () => {
    for (const { id } of billingPlans) {
      const tier = getPlanTier(id);
      expect(isTeamPlanId(id)).toBe(tier === "team");
      expect(isIndividualPlanId(id)).toBe(tier !== null && tier !== "team");
    }
  });

  test("reject unknown and missing plan IDs", () => {
    for (const planId of ["unknown", "pro_team_unknown", null, undefined]) {
      expect(isTeamPlanId(planId)).toBe(false);
      expect(isIndividualPlanId(planId)).toBe(false);
    }
  });
});
