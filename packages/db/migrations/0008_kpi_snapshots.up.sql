CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id BIGSERIAL PRIMARY KEY,
  value_multiple NUMERIC(12, 4) NOT NULL,
  close_rate NUMERIC(8, 4) NOT NULL,
  median_cycle_time_days NUMERIC(12, 4) NOT NULL,
  fraud_loss_pct NUMERIC(8, 4) NOT NULL,
  active_tasks INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_created_at ON kpi_snapshots(created_at DESC);
