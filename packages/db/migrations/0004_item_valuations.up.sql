CREATE TABLE IF NOT EXISTS item_valuations (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  estimated_value_usd NUMERIC(12, 2) NOT NULL,
  confidence_score NUMERIC(5, 2) NOT NULL,
  input_comps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_valuations_item_id ON item_valuations(item_id);
