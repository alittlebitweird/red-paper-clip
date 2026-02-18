import { describe, expect, it } from "vitest";

import { computeValuation } from "./valuation.js";

describe("computeValuation", () => {
  it("uses comps median when no base value is supplied", () => {
    const result = computeValuation({
      comps: [{ priceUsd: 100 }, { priceUsd: 120 }, { priceUsd: 110 }]
    });

    expect(result.estimatedValueUsd).toBe(110);
    expect(result.modelVersion).toBe("rules-v1");
  });

  it("blends base value with comps median", () => {
    const result = computeValuation({
      baseValueUsd: 200,
      comps: [{ priceUsd: 100 }, { priceUsd: 120 }, { priceUsd: 110 }]
    });

    expect(result.estimatedValueUsd).toBe(141.5);
  });

  it("throws when no valid values are supplied", () => {
    expect(() => computeValuation({ comps: [{ priceUsd: 0 }] })).toThrow(
      "At least one positive comp or base value is required"
    );
  });
});
