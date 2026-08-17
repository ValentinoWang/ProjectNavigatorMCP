import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { moduleMap } from "../discovery/moduleMap.js";
import { resolveSymbol } from "../discovery/symbolResolver.js";
import { openProject } from "../db/project.js";
import { getRepoMap } from "../graph/repoMap.js";
import { findSymbol } from "../graph/symbolSearch.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { PACKAGE_VERSION } from "../shared/packageInfo.js";
import { getProjectPaths } from "../shared/paths.js";
import { canonicalRepoRoot, currentGitSha, hashRepoFiles } from "./provenance.js";
import { semanticResult } from "./result.js";
import type {
  SemanticArchitectureData,
  SemanticBackend,
  SemanticBackendStatus,
  SemanticChangeData,
  SemanticIndexData,
  SemanticProvenance,
  SemanticResult,
  SemanticSearchData,
  SemanticTraceData,
  SemanticTraceHit
} from "./types.js";

interface ScanStatusRow {
  gitSha: string | null;
  finishedAt: string | null;
  status: string;
}

interface TraceRow {
  id: number;
  name: string;
  qualifiedName: string | null;
  path: string;
  confidence: number;
}

export class BuiltinSemanticBackend implements SemanticBackend {
  readonly name = "builtin" as const;

  async status(repoPath: string): Promise<SemanticResult<SemanticBackendStatus>> {
    const root = canonicalRepoRoot(repoPath);
    const paths = getProjectPaths(root);
    if (!existsSync(paths.dbPath)) {
      const data: SemanticBackendStatus = {
        available: true,
        indexed: false,
        binary: null,
        version: PACKAGE_VERSION,
        project: path.basename(root),
        status: "unindexed",
        reason: "ProjectNavigator index does not exist. Run semantic_index or pnav scan.",
        rawStatus: null
      };
      return semanticResult(this.name, "builtin", data, builtinProvenance(root, null, hashRepoFiles(root, [])), [
        "ProjectNavigator index does not exist. Run semantic_index or pnav scan."
      ]);
    }
    const scan = latestScan(root);
    const indexed = scan?.status === "success";
    const data: SemanticBackendStatus = {
      available: true,
      indexed,
      binary: null,
      version: PACKAGE_VERSION,
      project: path.basename(root),
      status: indexed ? "ready" : (scan?.status ?? "unindexed"),
      reason: indexed ? null : "ProjectNavigator has no successful scan. Run semantic_index or pnav scan.",
      rawStatus: scan ? { ...scan } : null
    };
    return semanticResult(
      this.name,
      "builtin",
      data,
      builtinProvenance(root, scan, hashRepoFiles(root, [])),
      data.reason ? [data.reason] : []
    );
  }

  async index(repoPath: string): Promise<SemanticResult<SemanticIndexData>> {
    const root = canonicalRepoRoot(repoPath);
    const scanned = scanRepo(root, { mode: "incremental" });
    const scan = latestScan(root);
    const data: SemanticIndexData = {
      indexed: true,
      project: path.basename(root),
      status: { ...scanned }
    };
    return semanticResult(this.name, "builtin", data, builtinProvenance(root, scan, hashRepoFiles(root, [])));
  }

  async search(repoPath: string, query: string, limit: number): Promise<SemanticResult<SemanticSearchData>> {
    const root = canonicalRepoRoot(repoPath);
    const symbols = findSymbol(root, query, limit).map((hit) => ({
      name: hit.name,
      qualifiedName: hit.qualifiedName ?? null,
      kind: hit.kind,
      path: hit.path,
      startLine: hit.startLine,
      endLine: hit.endLine,
      score: hit.score,
      inDegree: null,
      outDegree: null
    }));
    const data: SemanticSearchData = {
      query,
      symbols,
      total: symbols.length,
      hasMore: symbols.length === limit,
      rawEvidence: { source: "project-navigator-symbol-index", returned: symbols.length }
    };
    return semanticResult(
      this.name,
      "builtin",
      data,
      builtinProvenance(
        root,
        latestScan(root),
        hashRepoFiles(
          root,
          symbols.map((hit) => hit.path)
        )
      ),
      ["Builtin total is limited to the returned ProjectNavigator result window; hasMore is conservative."]
    );
  }

  async trace(
    repoPath: string,
    query: string,
    direction: "inbound" | "outbound" | "both",
    depth: number,
    limit: number
  ): Promise<SemanticResult<SemanticTraceData>> {
    const root = canonicalRepoRoot(repoPath);
    const target = resolveSymbol(root, query);
    const callers = target && direction !== "outbound" ? traceBuiltin(root, target.id, "inbound", depth, limit) : [];
    const callees = target && direction !== "inbound" ? traceBuiltin(root, target.id, "outbound", depth, limit) : [];
    const data: SemanticTraceData = {
      symbol: target?.qualifiedName ?? target?.name ?? query,
      direction,
      callers,
      callees,
      truncated: callers.length === limit || callees.length === limit,
      nextCursor: null,
      rawEvidence: { source: "project-navigator-symbol-edges", maxDepth: depth }
    };
    const files = [...callers, ...callees].map((hit) => hit.path);
    return semanticResult(
      this.name,
      "builtin",
      data,
      builtinProvenance(root, latestScan(root), hashRepoFiles(root, files)),
      data.truncated ? ["Builtin trace reached the requested result limit and does not expose a cursor."] : []
    );
  }

  async architecture(repoPath: string, scope = ""): Promise<SemanticResult<SemanticArchitectureData>> {
    const root = canonicalRepoRoot(repoPath);
    const repo = getRepoMap(root);
    const modules = moduleMap(root, scope, 100);
    const data: SemanticArchitectureData = {
      summary: { repo, ...modules },
      rawEvidence: { source: "project-navigator-module-index", scope: scope || null }
    };
    const files = modules.modules.flatMap((module) => [module.root, ...module.coreFiles, ...module.tests]);
    return semanticResult(
      this.name,
      "builtin",
      data,
      builtinProvenance(root, latestScan(root), hashRepoFiles(root, files))
    );
  }

  async detectChanges(repoPath: string, baseBranch = "main"): Promise<SemanticResult<SemanticChangeData>> {
    const root = canonicalRepoRoot(repoPath);
    const { mergeBase, changedFiles, warning } = gitChanges(root, baseBranch);
    const project = openProject(root);
    let impacted: Array<{ path: string; hop: number; relationship: string; confidence: number }> = [];
    try {
      const seen = new Map<string, { path: string; hop: number; relationship: string; confidence: number }>();
      for (const changedFile of changedFiles.slice(0, 100)) {
        const file = project.db
          .prepare("SELECT id FROM files WHERE repo_id = ? AND path = ?")
          .get(project.repo.id, changedFile) as { id: number } | undefined;
        if (!file) {
          continue;
        }
        const rows = project.db
          .prepare(
            `SELECT DISTINCT ff.path, e.kind AS relationship, e.confidence
             FROM edges e JOIN files ff ON ff.id = e.from_id
             WHERE e.repo_id = ? AND e.from_type = 'file' AND e.to_type = 'file' AND e.to_id = ?
             ORDER BY e.confidence DESC, ff.path LIMIT 50`
          )
          .all(project.repo.id, file.id) as Array<{ path: string; relationship: string; confidence: number }>;
        for (const row of rows) {
          const existing = seen.get(row.path);
          if (!existing || row.confidence > existing.confidence) {
            seen.set(row.path, { ...row, hop: 1 });
          }
        }
      }
      impacted = Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence || a.path.localeCompare(b.path));
    } finally {
      project.db.close();
    }
    const changes = {
      base: baseBranch,
      merge_base: mergeBase,
      direction: "inbound",
      changed_files: changedFiles,
      seed_symbols: [],
      impacted_total: impacted.length,
      impacted_shown: impacted.length,
      impacted,
      impacted_modules: [],
      truncated: false
    };
    return semanticResult(
      this.name,
      "builtin",
      { changes, rawEvidence: { source: "git-and-project-navigator-file-edges" } },
      builtinProvenance(
        root,
        latestScan(root),
        hashRepoFiles(root, [...changedFiles, ...impacted.map((hit) => hit.path)])
      ),
      warning ? [warning] : []
    );
  }
}

function builtinProvenance(
  root: string,
  scan: ScanStatusRow | null,
  fileHashEvidence: ReturnType<typeof hashRepoFiles>
): SemanticProvenance {
  const gitSha = currentGitSha(root);
  const indexed = scan?.status === "success";
  const freshness = !indexed
    ? "unindexed"
    : !scan.gitSha || !gitSha
      ? "unknown"
      : gitSha.startsWith(scan.gitSha)
        ? "fresh"
        : "stale";
  return {
    backend: "builtin",
    backendVersion: PACKAGE_VERSION,
    contractVersion: 1,
    authority: "supporting_evidence_only",
    repoRoot: root,
    project: path.basename(root),
    gitSha,
    indexedAt: scan?.finishedAt ?? null,
    queriedAt: new Date().toISOString(),
    freshness,
    coverage: null,
    ...fileHashEvidence
  };
}

function latestScan(repoPath: string): ScanStatusRow | null {
  const project = openProject(repoPath);
  try {
    return (
      (project.db
        .prepare(
          `SELECT git_sha AS gitSha, finished_at AS finishedAt, status
           FROM scan_runs WHERE repo_id = ? ORDER BY id DESC LIMIT 1`
        )
        .get(project.repo.id) as ScanStatusRow | undefined) ?? null
    );
  } finally {
    project.db.close();
  }
}

function traceBuiltin(
  repoPath: string,
  startId: number,
  direction: "inbound" | "outbound",
  depth: number,
  limit: number
): SemanticTraceHit[] {
  const project = openProject(repoPath);
  try {
    const results: SemanticTraceHit[] = [];
    const visited = new Set<number>([startId]);
    let frontier = [startId];
    for (let hop = 1; hop <= depth && frontier.length > 0 && results.length < limit; hop += 1) {
      const next: number[] = [];
      for (const symbolId of frontier) {
        const rows = loadTraceRows(project.db, project.repo.id, symbolId, direction);
        for (const row of rows) {
          if (visited.has(row.id)) {
            continue;
          }
          visited.add(row.id);
          next.push(row.id);
          results.push({
            name: row.name,
            qualifiedName: row.qualifiedName,
            path: row.path,
            hop,
            strategy: null,
            confidence: row.confidence
          });
          if (results.length >= limit) {
            break;
          }
        }
        if (results.length >= limit) {
          break;
        }
      }
      frontier = next;
    }
    return results;
  } finally {
    project.db.close();
  }
}

function loadTraceRows(
  db: ReturnType<typeof openProject>["db"],
  repoId: number,
  symbolId: number,
  direction: "inbound" | "outbound"
): TraceRow[] {
  const select = `SELECT s.id, s.name, s.qualified_name AS qualifiedName, f.path,
                         e.confidence
                  FROM symbol_edges e JOIN symbols s ON s.id = $nextSymbol
                  JOIN files f ON f.id = s.file_id
                  WHERE e.repo_id = $repoId AND $currentSymbol = $symbolId
                  ORDER BY e.confidence DESC, f.path, s.start_line`;
  const sql =
    direction === "inbound"
      ? select.replace("$nextSymbol", "e.from_symbol_id").replace("$currentSymbol", "e.to_symbol_id")
      : select.replace("$nextSymbol", "e.to_symbol_id").replace("$currentSymbol", "e.from_symbol_id");
  return db.prepare(sql).all({ repoId, symbolId }) as TraceRow[];
}

function gitChanges(
  repoRoot: string,
  baseBranch: string
): {
  mergeBase: string | null;
  changedFiles: string[];
  warning: string | null;
} {
  let mergeBase: string | null = null;
  const changed = new Set<string>();
  try {
    mergeBase = git(repoRoot, ["merge-base", baseBranch, "HEAD"]).trim() || null;
    if (mergeBase) {
      addLines(changed, git(repoRoot, ["diff", "--name-only", "--diff-filter=ACDMRTUXB", `${mergeBase}...HEAD`]));
    }
  } catch {
    mergeBase = null;
  }
  try {
    addLines(changed, git(repoRoot, ["diff", "--name-only", "--diff-filter=ACDMRTUXB"]));
    addLines(changed, git(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB"]));
    addLines(changed, git(repoRoot, ["ls-files", "--others", "--exclude-standard"]));
  } catch {
    return {
      mergeBase,
      changedFiles: Array.from(changed).sort(),
      warning: "Builtin change detection could not read all Git worktree states."
    };
  }
  return {
    mergeBase,
    changedFiles: Array.from(changed).sort(),
    warning: mergeBase ? null : `Git merge-base could not resolve ${baseBranch}; only worktree changes are included.`
  };
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"]
  });
}

function addLines(target: Set<string>, output: string): void {
  for (const line of output.split(/\r?\n/)) {
    const normalized = line.trim().replaceAll("\\", "/");
    if (normalized) {
      target.add(normalized);
    }
  }
}
