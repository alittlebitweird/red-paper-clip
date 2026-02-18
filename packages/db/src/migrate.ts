import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { getDatabaseUrl } from "./config.js";
import { listMigrationPairs } from "./migration-files.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../migrations");

const ensureMigrationsTable = async (client: Client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const runUp = async (client: Client) => {
  const migrations = await listMigrationPairs(migrationsDir);

  for (const migration of migrations) {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = $1",
      [migration.id]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    const sql = await readFile(migration.upPath, "utf8");
    await client.query("BEGIN");

    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
      await client.query("COMMIT");
      console.log(`[db] applied migration ${migration.id}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
};

const runDown = async (client: Client) => {
  const applied = await client.query<{ id: string }>(
    "SELECT id FROM schema_migrations ORDER BY applied_at DESC LIMIT 1"
  );

  if (!applied.rowCount || applied.rowCount < 1) {
    console.log("[db] no applied migrations to roll back");
    return;
  }

  const migrationId = applied.rows[0].id;
  const migrations = await listMigrationPairs(migrationsDir);
  const migration = migrations.find((entry) => entry.id === migrationId);

  if (!migration) {
    throw new Error(`Could not find down migration for applied migration ${migrationId}`);
  }

  const sql = await readFile(migration.downPath, "utf8");

  await client.query("BEGIN");

  try {
    await client.query(sql);
    await client.query("DELETE FROM schema_migrations WHERE id = $1", [migration.id]);
    await client.query("COMMIT");
    console.log(`[db] rolled back migration ${migration.id}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const run = async () => {
  const action = process.argv[2];

  if (action !== "up" && action !== "down") {
    throw new Error("Usage: tsx src/migrate.ts <up|down>");
  }

  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  try {
    await ensureMigrationsTable(client);

    if (action === "up") {
      await runUp(client);
    } else {
      await runDown(client);
    }
  } finally {
    await client.end();
  }
};

await run();
