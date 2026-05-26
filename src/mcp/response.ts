import path from "node:path";
import { openProject } from "../db/project.js";
import { getGitSha } from "../scanner/gitScanner.js";

export interface ToolResponse<T> {
  repo: string;
  generated_at: string;
  index_status: {
    scanned: boolean;
    git_sha: string | null;
    current_git_sha: string | null;
    stale: boolean;
  };
  data: T;
  warnings: string[];
}

export function toolResponse<T>(repoPath: string, data: T, warnings: string[] = []): ToolResponse<T> {
  const status = getIndexStatus(repoPath);
  return {
    repo: path.basename(status.rootPath),
    generated_at: new Date().toISOString(),
    index_status: {
      scanned: status.scanned,
      git_sha: status.gitSha,
      current_git_sha: status.currentGitSha,
      stale: status.stale
    },
    data,
    warnings: [...warnings, ...status.warnings]
  };
}

function getIndexStatus(repoPath: string): {
  rootPath: string;
  scanned: boolean;
  gitSha: string | null;
  currentGitSha: string | null;
  stale: boolean;
  warnings: string[];
} {
  const project = openProject(repoPath);
  try {
    const row = project.db
      .prepare("SELECT git_sha AS gitSha, status FROM scan_runs WHERE repo_id = ? ORDER BY id DESC LIMIT 1")
      .get(project.repo.id) as { gitSha: string | null; status: string } | undefined;
    const currentGitSha = getGitSha(project.repoRoot);
    const scanned = row?.status === "success";
    const stale = Boolean(scanned && row?.gitSha && currentGitSha && row.gitSha !== currentGitSha);
    const warnings: string[] = [];
    if (!scanned) {
      warnings.push("Repository has not been scanned successfully yet. Run pnav scan <repo>.");
    }
    if (stale) {
      warnings.push("Repository Git HEAD differs from the latest successful scan. Run pnav scan <repo>.");
    }
    return {
      rootPath: project.repoRoot,
      scanned,
      gitSha: row?.gitSha ?? null,
      currentGitSha,
      stale,
      warnings
    };
  } finally {
    project.db.close();
  }
}

