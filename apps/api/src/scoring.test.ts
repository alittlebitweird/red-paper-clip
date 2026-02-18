import { describe, expect, it } from "vitest";

import { buildScoreComponents, computeTradeScore, rankCandidates } from "./scoring.js";

describe("scoring engine", () => {
  it("computes weighted trade score", () => {
    const score = computeTradeScore({
      valueGain: 0.5,
      closeProb: 0.8,
      liquidity: 0.7,
      storyValue: 0.6,
      fraudRisk: 0.2,
      timeCost: 0.4
    });

    expect(score).toBe(0.44);
  });

  it("builds components from raw candidate", () => {
    const components = buildScoreComponents(
      {
        opportunityId: 1,
        targetValueUsd: 200,
        source: "craigslist",
        category: "electronics",
        sellerRepScore: 4
      },
      100
    );

    expect(components.valueGain).toBe(1);
    expect(components.liquidity).toBeGreaterThan(0.6);
  });

  it("returns ranked candidates sorted by score", () => {
    const ranked = rankCandidates(
      [
        {
          opportunityId: 1,
          targetValueUsd: 180,
          source: "craigslist",
          category: "electronics",
          sellerRepScore: 3.2
        },
        {
          opportunityId: 2,
          targetValueUsd: 150,
          source: "etsy",
          category: "collectibles",
          sellerRepScore: 4.8
        }
      ],
      100,
      2
    );

    expect(ranked).toHaveLength(2);
    expect(ranked[0].tradeScore).toBeGreaterThanOrEqual(ranked[1].tradeScore);
  });
});
