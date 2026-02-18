DROP INDEX IF EXISTS idx_tasks_provider_task_id;

ALTER TABLE tasks
  DROP COLUMN IF EXISTS provider_task_id,
  DROP COLUMN IF EXISTS provider_name;
