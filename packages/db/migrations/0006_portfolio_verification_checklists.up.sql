CREATE TABLE IF NOT EXISTS portfolio_verification_checklists (
  id BIGSERIAL PRIMARY KEY,
  portfolio_position_id BIGINT NOT NULL REFERENCES portfolio_positions(id) ON DELETE CASCADE,
  checks JSONB NOT NULL,
  passed BOOLEAN NOT NULL,
  outcome_status TEXT NOT NULL CHECK (outcome_status IN ('verified', 'failed', 'disputed')),
  created_by_user_id TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_verification_position_id
  ON portfolio_verification_checklists(portfolio_position_id);
