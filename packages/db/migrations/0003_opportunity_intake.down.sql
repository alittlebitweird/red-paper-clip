DROP INDEX IF EXISTS idx_opportunities_dedupe_key;

ALTER TABLE opportunities
  DROP COLUMN IF EXISTS dedupe_key,
  DROP COLUMN IF EXISTS normalized_payload,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS title;
