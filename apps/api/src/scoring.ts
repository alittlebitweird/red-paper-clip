export type TradeScoreComponents = {
  valueGain: number;
  closeProb: number;
  liquidity: number;
  storyValue: number;
  fraudRisk: number;
  timeCost: number;
};

export type RankedTradeCandidate = {
  opportunityId: number;
  tradeScore: number;
  components: TradeScoreComponents;
  targetValueUsd: number;
};

export type RawScoringCandidate = {
  opportunityId: number;
  targetValueUsd: number;
  source: string;
  category: string;
  sellerRepScore?: number;
  expiresAt?: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const categoryLiquidity: Record<string, number> = {
  electronics: 0.72,
  tools: 0.7,
  collectibles: 0.58,
  furniture: 0.42,
  vehicles: 0.45
};

const sourceStoryValue: Record<string, number> = {
  craigslist: 0.62,
  offerup: 0.55,
  ebay: 0.5,
  etsy: 0.46
};

const estimateTimeCost = (expiresAt?: string) => {
  if (!expiresAt) {
    return 0.4;
  }

  const expiresTs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresTs)) {
    return 0.4;
  }

  const nowTs = Date.now();
  const daysUntilExpiry = (expiresTs - nowTs) / (1000 * 60 * 60 * 24);

  return clamp(1 - clamp(daysUntilExpiry / 10, 0, 1), 0, 1);
};

export const buildScoreComponents = (
  candidate: RawScoringCandidate,
  currentItemValueUsd: number
): TradeScoreComponents => {
  const targetValueUsd = Math.max(candidate.targetValueUsd, 0.01);
  const valueGain = (targetValueUsd - currentItemValueUsd) / currentItemValueUsd;
  const closeProb = clamp((candidate.sellerRepScore ?? 2.5) / 5, 0, 1);
  const liquidity = categoryLiquidity[candidate.category] ?? 0.5;
  const storyValue = sourceStoryValue[candidate.source] ?? 0.5;
  const fraudRisk = clamp(1 - closeProb + (candidate.source === "craigslist" ? 0.1 : 0), 0, 1);
  const timeCost = estimateTimeCost(candidate.expiresAt);

  return {
    valueGain,
    closeProb,
    liquidity,
    storyValue,
    fraudRisk,
    timeCost
  };
};

export const computeTradeScore = (components: TradeScoreComponents) => {
  return Number(
    (
      0.35 * components.valueGain +
      0.2 * components.closeProb +
      0.15 * components.liquidity +
      0.1 * components.storyValue -
      0.1 * components.fraudRisk -
      0.1 * components.timeCost
    ).toFixed(4)
  );
};

export const rankCandidates = (
  rawCandidates: RawScoringCandidate[],
  currentItemValueUsd: number,
  limit: number
): RankedTradeCandidate[] => {
  return rawCandidates
    .map((candidate) => {
      const components = buildScoreComponents(candidate, currentItemValueUsd);
      return {
        opportunityId: candidate.opportunityId,
        targetValueUsd: candidate.targetValueUsd,
        components,
        tradeScore: computeTradeScore(components)
      };
    })
    .sort((a, b) => b.tradeScore - a.tradeScore)
    .slice(0, limit);
};
