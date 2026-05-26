import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { sha1 } from "../shared/hashing.js";
import { detectLanguage, isIndexableTextFile } from "../shared/languages.js";
import type { ScannedFile } from "./types.js";

const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "build",
  "dist",
  ".dart_tool",
  ".venv",
  "venv",
  "env",
  "coverage",
  ".pnav",
  ".mypy_cache",
  ".tmp",
  ".cache",
  ".ruff_cache",
  "__pycache__",
  ".pytest_cache"
]);

const MAX_TEXT_FILE_BYTES = 1_500_000;

export function scanFiles(repoRoot: string): ScannedFile[] {
  const files: ScannedFile[] = [];
  walk(repoRoot, repoRoot, files);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export function readRepoTextFile(repoRoot: string, relativePath: string): string | null {
  const absolutePath = path.join(repoRoot, relativePath);
  try {
    const stats = statSync(absolutePath);
    if (!stats.isFile() || stats.size > MAX_TEXT_FILE_BYTES) {
      return null;
    }
    return readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
}

function walk(root: string, current: string, files: ScannedFile[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") {
      continue;
    }
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!DEFAULT_IGNORED_DIRS.has(entry.name)) {
        walk(root, absolutePath, files);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    if (!isIndexableTextFile(relativePath)) {
      continue;
    }

    const stats = statSync(absolutePath);
    if (stats.size > MAX_TEXT_FILE_BYTES) {
      continue;
    }

    const content = readFileSync(absolutePath);
    files.push({
      path: relativePath,
      language: detectLanguage(relativePath),
      size: stats.size,
      hash: sha1(content)
    });
  }
}
