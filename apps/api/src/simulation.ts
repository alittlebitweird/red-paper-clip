export type SimulationInput = {
  seed: number;
  scenarioCount: number;
  startValueUsd: number;
};

export type SimulationScenario = {
  index: number;
  offerQuality: number;
  closeProbability: number;
  valueGainPct: number;
  expectedValueUsd: number;
};

export type SimulationSummary = {
  seed: number;
  scenarioCount: number;
  startValueUsd: number;
  finalExpectedValueUsd: number;
  scenarios: SimulationScenario[];
};

const createRng = (seed: number) => {
  let state = Math.floor(seed) % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

export const runTradeSimulation = (input: SimulationInput): SimulationSummary => {
  if (input.scenarioCount < 1) {
    throw new Error("scenarioCount must be at least 1");
  }

  if (input.startValueUsd <= 0) {
    throw new Error("startValueUsd must be positive");
  }

  const random = createRng(input.seed);
  const scenarios: SimulationScenario[] = [];
  let expectedValue = input.startValueUsd;

  for (let index = 1; index <= input.scenarioCount; index += 1) {
    const offerQuality = Number(random().toFixed(4));
    const closeProbability = Number((0.35 + random() * 0.55).toFixed(4));
    const rawGainPct = -0.08 + offerQuality * 0.95;
    const valueGainPct = Number(rawGainPct.toFixed(4));

    const tradeOutcome = expectedValue * (1 + valueGainPct * closeProbability);
    expectedValue = Number(Math.max(0.01, tradeOutcome).toFixed(2));

    scenarios.push({
      index,
      offerQuality,
      closeProbability,
      valueGainPct,
      expectedValueUsd: expectedValue
    });
  }

  return {
    seed: input.seed,
    scenarioCount: input.scenarioCount,
    startValueUsd: input.startValueUsd,
    finalExpectedValueUsd: expectedValue,
    scenarios
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = Number(process.argv[2] ?? 42);
  const scenarioCount = Number(process.argv[3] ?? 10);
  const startValueUsd = Number(process.argv[4] ?? 0.9);

  const summary = runTradeSimulation({
    seed,
    scenarioCount,
    startValueUsd
  });

  console.log(JSON.stringify(summary, null, 2));
}
