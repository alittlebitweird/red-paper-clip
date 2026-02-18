export type ValuationComp = {
  priceUsd: number;
  source?: string;
};

export type ValuationInput = {
  baseValueUsd?: number;
  comps: ValuationComp[];
};

export type ValuationResult = {
  estimatedValueUsd: number;
  confidenceScore: number;
  modelVersion: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
};

const standardDeviation = (values: number[]) => {
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

export const computeValuation = (input: ValuationInput): ValuationResult => {
  const compValues = input.comps
    .map((comp) => comp.priceUsd)
    .filter((priceUsd) => Number.isFinite(priceUsd) && priceUsd > 0);

  const hasBaseValue = Number.isFinite(input.baseValueUsd) && (input.baseValueUsd ?? 0) > 0;

  if (compValues.length === 0 && !hasBaseValue) {
    throw new Error("At least one positive comp or base value is required");
  }

  const compMedian = compValues.length > 0 ? median(compValues) : (input.baseValueUsd as number);
  const estimatedRaw = hasBaseValue
    ? (input.baseValueUsd as number) * 0.35 + compMedian * 0.65
    : compMedian;

  const mean = compValues.length > 0 ? compValues.reduce((sum, value) => sum + value, 0) / compValues.length : estimatedRaw;
  const dispersion = mean > 0 ? standardDeviation(compValues) / mean : 0;

  const confidenceRaw =
    0.45 +
    Math.min(compValues.length, 10) * 0.05 +
    (hasBaseValue ? 0.05 : 0) -
    dispersion * 0.35;

  return {
    estimatedValueUsd: Number(estimatedRaw.toFixed(2)),
    confidenceScore: Number(clamp(confidenceRaw, 0.1, 0.95).toFixed(2)),
    modelVersion: "rules-v1"
  };
};
