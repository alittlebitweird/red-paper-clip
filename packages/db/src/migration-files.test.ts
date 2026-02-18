import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listMigrationPairs } from "./migration-files.js";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rpc-migrations-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("listMigrationPairs", () => {
  it("returns sorted migration pairs", async () => {
    const dir = await makeTempDir();

    await writeFile(path.join(dir, "0002_second.up.sql"), "-- up");
    await writeFile(path.join(dir, "0002_second.down.sql"), "-- down");
    await writeFile(path.join(dir, "0001_first.up.sql"), "-- up");
    await writeFile(path.join(dir, "0001_first.down.sql"), "-- down");

    const migrations = await listMigrationPairs(dir);

    expect(migrations.map((migration) => migration.id)).toEqual(["0001_first", "0002_second"]);
  });

  it("throws when a down migration is missing", async () => {
    const dir = await makeTempDir();

    await writeFile(path.join(dir, "0001_first.up.sql"), "-- up");

    await expect(listMigrationPairs(dir)).rejects.toThrow("Missing down migration for 0001_first");
  });
});
