ALTER TABLE portfolio_positions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_portfolio_positions_status
  ON portfolio_positions(current_status);
