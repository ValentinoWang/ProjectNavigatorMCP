import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { EvidenceFreshness } from "../graph/freshnessPolicy.js";
import type { SemanticFileHashCoverage } from "./types.js";

const MAX_HASHED_FILES = 256;

export interface RepoFileHashEvidence {
  fileHashes: Record<string, string>;
  fileHashCoverage: SemanticFileHashCoverage;
}

export function canonicalRepoRoot(repoPath: string): string {
  const resolved = path.resolve(repoPath);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function currentGitSha(repoRoot: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

export function hashRepoFiles(repoRoot: string, candidates: Iterable<string | null | undefined>): RepoFileHashEvidence {
  const root = canonicalRepoRoot(repoRoot);
  const allPaths = Array.from(
    new Set(Array.from(candidates).flatMap((candidate) => normalizeCandidate(root, candidate)))
  ).sort();
  const paths = allPaths.slice(0, MAX_HASHED_FILES);
  const hashes: Record<string, string> = {};
  for (const relativePath of paths) {
    const absolutePath = path.resolve(root, relativePath);
    let realPath: string;
    try {
      realPath = realpathSync(absolutePath);
      if (!isWithin(root, realPath) || !statSync(realPath).isFile()) {
        continue;
      }
      hashes[relativePath] = createHash("sha256").update(readFileSync(realPath)).digest("hex");
    } catch {
      continue;
    }
  }
  return {
    fileHashes: hashes,
    fileHashCoverage: {
      candidateCount: allPaths.length,
      hashedCount: Object.keys(hashes).length,
      limit: MAX_HASHED_FILES,
      truncated: allPaths.length > MAX_HASHED_FILES
    }
  };
}

export function freshnessFromCoverage(coverage: Record<string, unknown> | null): EvidenceFreshness | "unknown" {
  if (!coverage) {
    return "unknown";
  }
  const pathRows = Array.isArray(coverage.paths) ? coverage.paths.filter(isRecord) : [];
  if (pathRows.length > 0) {
    const freshness = pathRows.map((row) => stringValue(row.freshness));
    const statuses = pathRows.map((row) => stringValue(row.status));
    if (freshness.some((value) => value !== "metadata_match")) {
      return "stale";
    }
    if (statuses.some((value) => value === "partial")) {
      return "partial";
    }
    if (statuses.some((value) => value === "skipped" || value === "excluded" || value === "coverage_unavailable")) {
      return "weak";
    }
    return "metadata_only";
  }
  const scopes = Array.isArray(coverage.scopes) ? coverage.scopes.filter(isRecord) : [];
  if (scopes.some((scope) => stringValue(scope.status) === "known_gaps")) {
    return "weak";
  }
  return "unknown";
}

function normalizeCandidate(root: string, candidate: string | null | undefined): string[] {
  if (typeof candidate !== "string" || !candidate.trim()) {
    return [];
  }
  const normalizedInput = candidate.replaceAll("\\", "/");
  const absolutePath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(root, normalizedInput);
  if (!isWithin(root, absolutePath)) {
    return [];
  }
  const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
  if (!relativePath || relativePath === "." || relativePath.startsWith("../")) {
    return [];
  }
  return [relativePath];
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
