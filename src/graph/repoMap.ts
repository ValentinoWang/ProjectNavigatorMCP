import path from "node:path";
import { openProject } from "../db/project.js";
import type { ProjectDatabase } from "../db/connection.js";
import type { RepoMap } from "./types.js";

interface CountRow {
  count: number;
}

export function getRepoMap(repoPath: string): RepoMap {
  const project = openProject(repoPath);
  try {
    const db = project.db;
    const repoId = project.repo.id;
    const languages = db
      .prepare(
        "SELECT language, COUNT(*) AS files FROM files WHERE repo_id = ? GROUP BY language ORDER BY files DESC, language"
      )
      .all(repoId) as Array<{ language: string; files: number }>;
    const commands = db
      .prepare(
        "SELECT name, command, source_file AS sourceFile, category FROM commands WHERE repo_id = ? ORDER BY category, name LIMIT 30"
      )
      .all(repoId) as RepoMap["commands"];
    const latestScan = db
      .prepare("SELECT git_sha AS gitSha, status FROM scan_runs WHERE repo_id = ? ORDER BY id DESC LIMIT 1")
      .get(repoId) as { gitSha: string | null; status: string } | undefined;

    return {
      repo: project.repo.name,
      rootPath: project.repoRoot,
      gitSha: latestScan?.gitSha ?? null,
      languages,
      counts: {
        files: count(db, "files", repoId),
        symbols: countSymbols(db, repoId),
        routes: count(db, "routes", repoId),
        tests: count(db, "tests", repoId),
        commands: count(db, "commands", repoId),
        rules: count(db, "project_rules", repoId),
        memories: count(db, "memories", repoId)
      },
      importantPaths: getImportantPaths(db, repoId),
      commands,
      recentScanStatus: latestScan?.status ?? null
    };
  } finally {
    project.db.close();
  }
}

export function renderRepoMap(map: RepoMap): string {
  const lines = [
    `Repository: ${map.repo}`,
    `Root: ${map.rootPath}`,
    `Git SHA: ${map.gitSha ?? "unknown"}`,
    `Last scan: ${map.recentScanStatus ?? "none"}`,
    "",
    "Counts:",
    `- files: ${map.counts.files}`,
    `- symbols: ${map.counts.symbols}`,
    `- routes: ${map.counts.routes}`,
    `- tests: ${map.counts.tests}`,
    `- commands: ${map.counts.commands}`,
    `- rules: ${map.counts.rules}`,
    `- memories: ${map.counts.memories}`,
    "",
    "Languages:",
    ...map.languages.map((item) => `- ${item.language}: ${item.files}`),
    "",
    "Important paths:",
    ...map.importantPaths.map((item) => `- ${item}`),
    "",
    "Commands:",
    ...map.commands.slice(0, 20).map((item) => `- ${item.command} (${item.sourceFile})`)
  ];
  return lines.join("\n");
}

function count(db: ProjectDatabase, table: string, repoId: number): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE repo_id = ?`).get(repoId) as CountRow;
  return row.count;
}

function countSymbols(db: ProjectDatabase, repoId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM symbols s JOIN files f ON f.id = s.file_id WHERE f.repo_id = ?")
    .get(repoId) as CountRow;
  return row.count;
}

function getImportantPaths(db: ProjectDatabase, repoId: number): string[] {
  const rows = db
    .prepare(
      "SELECT path FROM files WHERE repo_id = ? AND (path IN ('AGENTS.md', 'CLAUDE.md', 'README.md', 'Makefile', 'package.json', 'pyproject.toml') OR path LIKE 'frontend/lib/%' OR path LIKE 'backend/app/api/%') ORDER BY path LIMIT 30"
    )
    .all(repoId) as Array<{ path: string }>;
  const compact = new Set<string>();
  for (const row of rows) {
    if (row.path.startsWith("frontend/lib/")) {
      compact.add("frontend/lib/");
    } else if (row.path.startsWith("backend/app/api/")) {
      compact.add("backend/app/api/");
    } else {
      compact.add(row.path);
    }
  }
  return Array.from(compact).sort((a, b) => path.posix.normalize(a).localeCompare(path.posix.normalize(b)));
}
