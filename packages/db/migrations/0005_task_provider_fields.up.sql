ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS provider_name TEXT NOT NULL DEFAULT 'rentahuman_stub',
  ADD COLUMN IF NOT EXISTS provider_task_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_provider_task_id
  ON tasks(provider_task_id)
  WHERE provider_task_id IS NOT NULL;
