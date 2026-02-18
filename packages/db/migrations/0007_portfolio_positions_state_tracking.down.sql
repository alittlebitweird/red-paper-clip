DROP INDEX IF EXISTS idx_portfolio_positions_status;

ALTER TABLE portfolio_positions
  DROP COLUMN IF EXISTS updated_at;
