import type { WorktreeStatus } from "./worktreeStatus.js";

export interface WorktreeBoundary {
  dirty: boolean;
  allowedEditFiles: string[];
  preExistingDirtyFiles: string[];
  riskyDirtyFiles: string[];
  verifyDiffCommands: string[];
  warnings: string[];
}

export function buildWorktreeBoundary(input: {
  dirtyWorktree: WorktreeStatus | null;
  preferredFiles: string[];
  changedFiles: string[];
}): WorktreeBoundary {
  const allowedEditFiles = Array.from(new Set([...input.preferredFiles, ...input.changedFiles].map(normalizePath)));
  const dirtyFiles = input.dirtyWorktree
    ? Array.from(new Set([...input.dirtyWorktree.modified, ...input.dirtyWorktree.untracked].map(normalizePath)))
    : [];
  const preExistingDirtyFiles = dirtyFiles.filter((file) => !allowedEditFiles.includes(file));
  const riskyDirtyFiles = preExistingDirtyFiles.filter((file) => !isGeneratedOrLocal(file));
  const verifyDiffCommands =
    allowedEditFiles.length > 0
      ? [`git diff -- ${allowedEditFiles.map(shellQuote).join(" ")}`, "git status --short"]
      : ["git status --short"];
  const warnings: string[] = [];
  if (input.dirtyWorktree?.dirty) {
    warnings.push("Worktree is dirty. Treat files outside allowedEditFiles as pre-existing context.");
  }
  if (riskyDirtyFiles.length > 0) {
    warnings.push("Risky pre-existing dirty files are present. Avoid formatting or broad edits.");
  }
  return {
    dirty: Boolean(input.dirtyWorktree?.dirty),
    allowedEditFiles,
    preExistingDirtyFiles,
    riskyDirtyFiles,
    verifyDiffCommands,
    warnings
  };
}

function isGeneratedOrLocal(filePath: string): boolean {
  return /\.(g|freezed|generated)\./.test(filePath) || filePath.startsWith(".pnav/") || filePath.startsWith("coverage");
}

function normalizePath(filePath: string): string {
  return filePath.replace(/^\.\/+/, "").replaceAll("\\", "/");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
