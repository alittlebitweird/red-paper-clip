ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'uncategorized',
  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_dedupe_key
  ON opportunities(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
