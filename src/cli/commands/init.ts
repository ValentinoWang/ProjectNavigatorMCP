import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { defaultProjectConfig } from "../../config/projectConfig.js";
import { openDatabase } from "../../db/connection.js";
import { migrate } from "../../db/migrations.js";
import { upsertRepo } from "../../db/repositories.js";
import { getProjectPaths } from "../../shared/paths.js";

export interface InitResult {
  repoRoot: string;
  pnavDir: string;
  dbPath: string;
  configPath: string;
  appliedMigrations: number[];
}

export function initProject(repo: string): InitResult {
  const paths = getProjectPaths(repo);
  mkdirSync(paths.pnavDir, { recursive: true });
  mkdirSync(paths.cacheDir, { recursive: true });

  if (!existsSync(paths.configPath)) {
    writeFileSync(paths.configPath, JSON.stringify(defaultProjectConfig(paths.repoRoot), null, 2) + "\n");
  }

  const db = openDatabase(paths.dbPath);
  try {
    const migration = migrate(db);
    upsertRepo(db, paths.repoRoot);
    return {
      repoRoot: paths.repoRoot,
      pnavDir: paths.pnavDir,
      dbPath: paths.dbPath,
      configPath: paths.configPath,
      appliedMigrations: migration.applied
    };
  } finally {
    db.close();
  }
}

export function renderInitResult(result: InitResult): string {
  return [
    "ProjectNavigatorMCP initialized",
    `repo: ${result.repoRoot}`,
    `index: ${result.dbPath}`,
    `config: ${result.configPath}`,
    `applied migrations: ${result.appliedMigrations.length === 0 ? "none" : result.appliedMigrations.join(", ")}`
  ].join("\n");
}

