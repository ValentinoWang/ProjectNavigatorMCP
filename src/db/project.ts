import { openDatabase, type ProjectDatabase } from "./connection.js";
import { migrate } from "./migrations.js";
import { upsertRepo, type RepoRecord } from "./repositories.js";
import { getProjectPaths } from "../shared/paths.js";

export interface OpenProjectResult {
  db: ProjectDatabase;
  repo: RepoRecord;
  repoRoot: string;
  dbPath: string;
}

export function openProject(repoPath: string): OpenProjectResult {
  const paths = getProjectPaths(repoPath);
  const db = openDatabase(paths.dbPath);
  migrate(db);
  const repo = upsertRepo(db, paths.repoRoot);
  return {
    db,
    repo,
    repoRoot: paths.repoRoot,
    dbPath: paths.dbPath
  };
}

