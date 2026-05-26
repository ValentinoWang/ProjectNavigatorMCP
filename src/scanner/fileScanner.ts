import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ProjectConfig } from "../config/projectConfig.js";
import { matchesAnyPattern } from "../config/projectConfig.js";
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

export function scanFiles(repoRoot: string, config?: ProjectConfig): ScannedFile[] {
  const files: ScannedFile[] = [];
  const gitignorePatterns = config?.respectGitignore ? readGitignorePatterns(repoRoot) : [];
  walk(repoRoot, repoRoot, files, config, gitignorePatterns);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export function readRepoTextFile(repoRoot: string, relativePath: string, maxBytes = 1_500_000): string | null {
  const absolutePath = path.join(repoRoot, relativePath);
  try {
    const stats = statSync(absolutePath);
    if (!stats.isFile() || stats.size > maxBytes) {
      return null;
    }
    return readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
}

function walk(
  root: string,
  current: string,
  files: ScannedFile[],
  config: ProjectConfig | undefined,
  gitignorePatterns: string[]
): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") {
      continue;
    }
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!DEFAULT_IGNORED_DIRS.has(entry.name)) {
        const relativeDir = `${path.relative(root, absolutePath).split(path.sep).join("/")}/`;
        if (!shouldExclude(relativeDir, config, gitignorePatterns)) {
          walk(root, absolutePath, files, config, gitignorePatterns);
        }
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    if (shouldExclude(relativePath, config, gitignorePatterns) || !shouldInclude(relativePath, config)) {
      continue;
    }
    if (!isIndexableTextFile(relativePath)) {
      continue;
    }

    const stats = statSync(absolutePath);
    if (stats.size > (config?.maxFileBytes ?? 1_500_000)) {
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

function shouldInclude(relativePath: string, config: ProjectConfig | undefined): boolean {
  if (!config || config.include.length === 0) {
    return true;
  }
  return matchesAnyPattern(relativePath, config.include);
}

function shouldExclude(relativePath: string, config: ProjectConfig | undefined, gitignorePatterns: string[]): boolean {
  if (config && matchesAnyPattern(relativePath, config.exclude)) {
    return true;
  }
  return gitignorePatterns.length > 0 && matchesAnyPattern(relativePath, gitignorePatterns);
}

function readGitignorePatterns(repoRoot: string): string[] {
  const content = readRepoTextFile(repoRoot, ".gitignore", 100_000);
  if (!content) {
    return [];
  }
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
    .map((line) => {
      if (line.endsWith("/")) {
        return `${line}**`;
      }
      if (!line.includes("/")) {
        return `**/${line}`;
      }
      return line;
    });
}
