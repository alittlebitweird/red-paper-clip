export type PortfolioStatus =
  | "seeded"
  | "sourcing"
  | "screened"
  | "negotiating"
  | "accepted_pending_verification"
  | "verified"
  | "completed"
  | "failed"
  | "disputed";

export const portfolioTransitions: Record<PortfolioStatus, PortfolioStatus[]> = {
  seeded: ["sourcing"],
  sourcing: ["screened", "failed"],
  screened: ["negotiating", "failed"],
  negotiating: ["accepted_pending_verification", "failed"],
  accepted_pending_verification: ["verified", "failed", "disputed"],
  verified: ["completed", "failed", "disputed"],
  completed: [],
  failed: [],
  disputed: []
};

export const isValidPortfolioStatus = (value: string): value is PortfolioStatus => {
  return Object.keys(portfolioTransitions).includes(value);
};

export const canTransitionPortfolioStatus = (from: PortfolioStatus, to: PortfolioStatus) => {
  return portfolioTransitions[from].includes(to);
};
