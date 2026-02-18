import { describe, expect, it } from "vitest";

import { runTradeSimulation } from "./simulation.js";

describe("runTradeSimulation", () => {
  it("is deterministic for the same seed and inputs", () => {
    const first = runTradeSimulation({ seed: 42, scenarioCount: 10, startValueUsd: 0.9 });
    const second = runTradeSimulation({ seed: 42, scenarioCount: 10, startValueUsd: 0.9 });

    expect(first.finalExpectedValueUsd).toBe(second.finalExpectedValueUsd);
    expect(first.scenarios).toEqual(second.scenarios);
  });

  it("returns the requested number of scenarios", () => {
    const summary = runTradeSimulation({ seed: 7, scenarioCount: 12, startValueUsd: 5 });

    expect(summary.scenarios).toHaveLength(12);
  });

  it("rejects invalid inputs", () => {
    expect(() => runTradeSimulation({ seed: 1, scenarioCount: 0, startValueUsd: 1 })).toThrow(
      "scenarioCount must be at least 1"
    );
  });
});
