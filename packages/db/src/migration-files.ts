import { readdir } from "node:fs/promises";
import path from "node:path";

export type MigrationPair = {
  id: string;
  upPath: string;
  downPath: string;
};

export const listMigrationPairs = async (migrationsDir: string): Promise<MigrationPair[]> => {
  const files = await readdir(migrationsDir);
  const upMigrations = files
    .filter((file) => file.endsWith(".up.sql"))
    .sort();

  return upMigrations.map((upMigration) => {
    const id = upMigration.replace(/\.up\.sql$/, "");
    const downMigration = `${id}.down.sql`;

    if (!files.includes(downMigration)) {
      throw new Error(`Missing down migration for ${id}`);
    }

    return {
      id,
      upPath: path.join(migrationsDir, upMigration),
      downPath: path.join(migrationsDir, downMigration)
    };
  });
};
