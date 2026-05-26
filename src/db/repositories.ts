import path from "node:path";
import type { ProjectDatabase } from "./connection.js";

export interface RepoRecord {
  id: number;
  root_path: string;
  name: string;
}

export function upsertRepo(db: ProjectDatabase, repoRoot: string): RepoRecord {
  const name = path.basename(repoRoot);
  db.prepare(
    `
    INSERT INTO repos (root_path, name, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(root_path) DO UPDATE SET
      name = excluded.name,
      updated_at = CURRENT_TIMESTAMP
    `
  ).run(repoRoot, name);

  const row = db.prepare("SELECT id, root_path, name FROM repos WHERE root_path = ?").get(repoRoot);
  if (!row) {
    throw new Error(`Failed to load repo after upsert: ${repoRoot}`);
  }
  return row as RepoRecord;
}
