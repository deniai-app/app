import assert from "node:assert/strict";
import { test } from "vitest";
import { campaignGroup, paginateCampaigns } from "./ad-campaign-list";

const now = Date.parse("2026-01-15T00:00:00Z");
const base = { status: "active", plan: "cpm", budgetYen: 300, spentYen: 0, endsAt: null };

test("filters budget-exhausted and expired campaigns as ended, not active", () => {
  assert.equal(campaignGroup(base, now), "active");
  assert.equal(campaignGroup({ ...base, spentYen: 300 }, now), "ended");
  assert.equal(campaignGroup({ ...base, plan: "cpc", spentYen: 290 }, now), "ended");
  assert.equal(
    campaignGroup(
      { ...base, plan: "fixed", spentYen: 3000, budgetYen: 3000, endsAt: "2026-02-01T00:00:00Z" },
      now,
    ),
    "active",
  );
  assert.equal(
    campaignGroup({ ...base, plan: "fixed", endsAt: "2026-01-14T00:00:00Z" }, now),
    "ended",
  );
  assert.equal(campaignGroup({ ...base, status: "paused" }, now), "ended");
  assert.equal(campaignGroup({ ...base, status: "rejected" }, now), "rejected");
  assert.equal(campaignGroup({ ...base, status: "approved" }, now), null);
});

test("paginates three ads per page and clamps stale pages after filtering", () => {
  const campaigns = Array.from({ length: 7 }, (_, index) => ({
    ...base,
    id: index,
    status: index === 6 ? "rejected" : "active",
  }));
  assert.deepEqual(
    paginateCampaigns(campaigns, "all", 2, now).items.map((ad) => ad.id),
    [3, 4, 5],
  );
  assert.deepEqual(
    paginateCampaigns(campaigns, "all", 3, now).items.map((ad) => ad.id),
    [6],
  );
  const rejected = paginateCampaigns(campaigns, "rejected", 3, now);
  assert.equal(rejected.currentPage, 1);
  assert.deepEqual(
    rejected.items.map((ad) => ad.id),
    [6],
  );
  assert.equal(paginateCampaigns(campaigns, "ended", 1, now).totalItems, 0);
});
