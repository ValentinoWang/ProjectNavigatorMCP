import { execFileSync } from "node:child_process";
import path from "node:path";

export interface WorktreeStatus {
  dirty: boolean;
  modified: string[];
  staged: string[];
  untracked: string[];
  summary: {
    modifiedCount: number;
    stagedCount: number;
    untrackedCount: number;
  };
  warnings: string[];
}

export function getWorktreeStatus(repoPath: string): WorktreeStatus {
  const root = path.resolve(repoPath);
  const output = runGit(root, ["status", "--porcelain"]);
  const modified = new Set<string>();
  const staged = new Set<string>();
  const untracked = new Set<string>();

  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const status = line.slice(0, 2);
    const file = normalizeStatusPath(line.slice(3));
    if (status === "??") {
      untracked.add(file);
      continue;
    }
    if (status[0] !== " " && status[0] !== "?") {
      staged.add(file);
    }
    if (status[1] !== " ") {
      modified.add(file);
    }
  }

  const summary = {
    modifiedCount: modified.size,
    stagedCount: staged.size,
    untrackedCount: untracked.size
  };
  const dirty = summary.modifiedCount + summary.stagedCount + summary.untrackedCount > 0;
  const warnings: string[] = [];
  if (dirty) {
    warnings.push(
      "Worktree has existing changes. Treat them as pre-existing context unless they are explicitly in this task boundary."
    );
  }
  if (summary.modifiedCount + summary.untrackedCount > 10) {
    warnings.push("Worktree is very dirty. Edit the minimum file set and verify with path-scoped git diff.");
  }

  return {
    dirty,
    modified: Array.from(modified).sort(),
    staged: Array.from(staged).sort(),
    untracked: Array.from(untracked).sort(),
    summary,
    warnings
  };
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function normalizeStatusPath(value: string): string {
  const renamed = value.includes(" -> ") ? (value.split(" -> ").at(-1) ?? value) : value;
  return renamed.replace(/^"|"$/g, "").split(path.sep).join("/");
}
