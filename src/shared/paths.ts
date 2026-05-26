import path from "node:path";
import { existsSync, statSync } from "node:fs";

export const PNAV_DIR_NAME = ".pnav";
export const PROJECT_DB_NAME = "project.sqlite";

export interface ProjectPaths {
  repoRoot: string;
  pnavDir: string;
  cacheDir: string;
  configPath: string;
  guardRulesPath: string;
  dbPath: string;
}

export function resolveRepoRoot(repo: string): string {
  const repoRoot = path.resolve(repo);
  if (!existsSync(repoRoot)) {
    throw new Error(`Repository path does not exist: ${repoRoot}`);
  }
  if (!statSync(repoRoot).isDirectory()) {
    throw new Error(`Repository path is not a directory: ${repoRoot}`);
  }
  return repoRoot;
}

export function getProjectPaths(repo: string): ProjectPaths {
  const repoRoot = resolveRepoRoot(repo);
  const pnavDir = path.join(repoRoot, PNAV_DIR_NAME);
  return {
    repoRoot,
    pnavDir,
    cacheDir: path.join(pnavDir, "cache"),
    configPath: path.join(pnavDir, "config.json"),
    guardRulesPath: path.join(pnavDir, "guard-rules.json"),
    dbPath: path.join(pnavDir, PROJECT_DB_NAME)
  };
}
