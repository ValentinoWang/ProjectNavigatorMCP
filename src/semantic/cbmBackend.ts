import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readlinkSync, readSync } from "node:fs";
import path from "node:path";
import {
  callCbmTool,
  DEFAULT_CBM_BINARY,
  DEFAULT_CBM_INDEX_TIMEOUT_MS,
  readCbmVersion,
  type CbmProcessOptions
} from "./cbmProcess.js";
import { SemanticBackendError, semanticErrorMessage } from "./errors.js";
import { canonicalRepoRoot, currentGitSha, freshnessFromCoverage, hashRepoFiles } from "./provenance.js";
import { semanticResult } from "./result.js";
import type {
  SemanticArchitectureData,
  SemanticBackend,
  SemanticBackendOptions,
  SemanticBackendStatus,
  SemanticChangeData,
  SemanticIndexData,
  SemanticProvenance,
  SemanticResult,
  SemanticSearchData,
  SemanticSymbolHit,
  SemanticTraceData,
  SemanticTraceHit
} from "./types.js";

export const SUPPORTED_CBM_VERSION = "0.10.2";
const COVERAGE_BATCH_SIZE = 128;
const TRACE_EVIDENCE_WARNING =
  "CBM 0.10.2 JSON trace output omits strategy/confidence columns; those fields are null rather than inferred.";

interface CbmProject {
  name: string;
  rootPath: string;
  nodes: number | null;
  edges: number | null;
}

interface CbmContext {
  root: string;
  version: string;
  project: CbmProject;
  status: Record<string, unknown>;
}

interface WorktreeSnapshot {
  porcelain: string;
  fingerprint: string;
  pathFingerprints: Record<string, string>;
}

export class CbmSemanticBackend implements SemanticBackend {
  readonly name = "codebase-memory" as const;
  private readonly processOptions: CbmProcessOptions;
  private versionPromise: Promise<string> | null = null;
  private readonly indexedAtByRoot = new Map<string, string>();

  constructor(options: SemanticBackendOptions = {}) {
    this.processOptions = {
      binary: options.cbmBinary ?? process.env.PNAV_CBM_BINARY ?? DEFAULT_CBM_BINARY,
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes
    };
  }

  async status(repoPath: string): Promise<SemanticResult<SemanticBackendStatus>> {
    const root = canonicalRepoRoot(repoPath);
    try {
      const version = await this.version();
      const project = await this.findProject(root);
      if (!project) {
        const data: SemanticBackendStatus = {
          available: true,
          indexed: false,
          binary: this.processOptions.binary ?? DEFAULT_CBM_BINARY,
          version,
          project: null,
          status: "unindexed",
          reason: "No CBM project has a canonical root matching this repository.",
          rawStatus: null
        };
        return semanticResult(this.name, "cbm", data, this.provenance(root, version, null, null, [], null), [
          "No CBM project has a canonical root matching this repository."
        ]);
      }
      const rawStatus = await this.projectStatus(root, project);
      const indexed = numberValue(rawStatus.nodes) > 0 && stringValue(rawStatus.status) === "ready";
      const data: SemanticBackendStatus = {
        available: true,
        indexed,
        binary: this.processOptions.binary ?? DEFAULT_CBM_BINARY,
        version,
        project: project.name,
        status: stringValue(rawStatus.status) || (indexed ? "ready" : "empty"),
        reason: indexed ? null : "The matching CBM project has no queryable nodes.",
        rawStatus
      };
      return semanticResult(
        this.name,
        "cbm",
        data,
        this.provenance(root, version, project.name, rawStatus, [], extractCoverage(rawStatus)),
        data.reason ? [data.reason] : []
      );
    } catch (error) {
      const data: SemanticBackendStatus = {
        available: false,
        indexed: false,
        binary: this.processOptions.binary ?? DEFAULT_CBM_BINARY,
        version: errorVersion(error),
        project: null,
        status: "unavailable",
        reason: semanticErrorMessage(error),
        rawStatus: errorDetails(error)
      };
      return semanticResult(
        this.name,
        "cbm",
        data,
        this.provenance(root, data.version, null, null, [], null),
        [semanticErrorMessage(error)],
        false
      );
    }
  }

  async index(repoPath: string): Promise<SemanticResult<SemanticIndexData>> {
    const root = canonicalRepoRoot(repoPath);
    const version = await this.version();
    assertNoRepositoryArtifact(root);
    const before = worktreeSnapshot(root);
    let rawIndex: Record<string, unknown> | null = null;
    let failure: unknown = null;
    try {
      rawIndex = await callCbmTool(
        "index_repository",
        { repo_path: root, persistence: false },
        {
          ...this.processOptions,
          timeoutMs: this.processOptions.timeoutMs ?? DEFAULT_CBM_INDEX_TIMEOUT_MS
        }
      );
    } catch (error) {
      failure = error;
    }
    let after: WorktreeSnapshot;
    try {
      after = worktreeSnapshot(root);
    } catch (error) {
      throw new SemanticBackendError(
        "worktree_unverifiable",
        "CBM indexing finished, but ProjectNavigator could not verify the repository worktree afterward.",
        {
          before: { porcelain: before.porcelain, fingerprint: before.fingerprint },
          cause: semanticErrorMessage(error),
          indexFailure: failure ? semanticErrorMessage(failure) : null
        }
      );
    }
    if (after.fingerprint !== before.fingerprint) {
      throw new SemanticBackendError(
        "worktree_modified",
        "CBM indexing changed the repository worktree. ProjectNavigator did not roll the changes back.",
        {
          before: { porcelain: before.porcelain, fingerprint: before.fingerprint },
          after: { porcelain: after.porcelain, fingerprint: after.fingerprint },
          changedPaths: changedSnapshotPaths(before, after),
          cause: failure ? semanticErrorMessage(failure) : null
        }
      );
    }
    const createdArtifacts = repositoryArtifactPaths(root);
    if (createdArtifacts.length > 0) {
      throw new SemanticBackendError(
        "worktree_modified",
        "CBM indexing created a repository artifact despite persistence being disabled. ProjectNavigator did not remove it.",
        {
          artifacts: createdArtifacts,
          cause: failure ? semanticErrorMessage(failure) : null
        }
      );
    }
    if (failure) {
      throw failure;
    }
    if (!rawIndex) {
      throw new SemanticBackendError("invalid_response", "CBM index_repository returned no result.");
    }
    const project = await this.requireProject(root);
    const status = await this.projectStatus(root, project);
    const indexed = numberValue(status.nodes) > 0 && stringValue(status.status) === "ready";
    if (!indexed) {
      throw new SemanticBackendError("not_indexed", "CBM indexing completed without a queryable graph.", {
        project: project.name,
        status
      });
    }
    const indexedAt = stringValue(rawIndex.indexed_at) || new Date().toISOString();
    this.indexedAtByRoot.set(root, indexedAt);
    const coverage = extractCoverage(status);
    const data: SemanticIndexData = {
      indexed: true,
      project: project.name,
      status: { ...status, index_response: rawIndex }
    };
    return semanticResult(
      this.name,
      "cbm",
      data,
      this.provenance(root, version, project.name, status, coveragePaths(coverage), coverage)
    );
  }

  async search(repoPath: string, query: string, limit: number): Promise<SemanticResult<SemanticSearchData>> {
    const context = await this.context(repoPath);
    const raw = await callCbmTool(
      "search_graph",
      { project: context.project.name, query, limit, format: "json" },
      this.processOptions
    );
    const symbols = parseSearchRows(raw);
    const files = symbols.map((symbol) => symbol.path).filter(isString);
    const coverage = await this.coverage(context.project.name, files);
    const data: SemanticSearchData = {
      query,
      symbols,
      total: integerValue(raw.total, symbols.length),
      hasMore: booleanValue(raw.has_more),
      rawEvidence: raw
    };
    return semanticResult(
      this.name,
      "cbm",
      data,
      this.provenance(context.root, context.version, context.project.name, context.status, files, coverage),
      coverageWarnings(coverage)
    );
  }

  async trace(
    repoPath: string,
    query: string,
    direction: "inbound" | "outbound" | "both",
    depth: number,
    limit: number
  ): Promise<SemanticResult<SemanticTraceData>> {
    const context = await this.context(repoPath);
    const raw = await callCbmTool(
      "trace_path",
      {
        project: context.project.name,
        function_name: query,
        direction,
        depth,
        limit,
        mode: "calls",
        format: "json",
        include_evidence: true
      },
      this.processOptions
    );
    const callers = parseTraceSection(raw.callers);
    const callees = parseTraceSection(raw.callees);
    const files = [...callers, ...callees].map((hit) => hit.path).filter(isString);
    const coverage = await this.coverage(context.project.name, files);
    const missingEvidence = [...callers, ...callees].some((hit) => hit.strategy === null || hit.confidence === null);
    const data: SemanticTraceData = {
      symbol: stringValue(raw.function) || query,
      direction,
      callers,
      callees,
      truncated: booleanValue(raw.truncated),
      nextCursor: nullableString(raw.next_cursor) ?? nullableString(raw.next),
      rawEvidence: raw
    };
    return semanticResult(
      this.name,
      "cbm",
      data,
      this.provenance(context.root, context.version, context.project.name, context.status, files, coverage),
      [...(missingEvidence ? [TRACE_EVIDENCE_WARNING] : []), ...coverageWarnings(coverage)]
    );
  }

  async architecture(repoPath: string, scope?: string): Promise<SemanticResult<SemanticArchitectureData>> {
    const context = await this.context(repoPath);
    const args: Record<string, unknown> = { project: context.project.name, format: "json" };
    if (scope) {
      args.path = scope;
    }
    const raw = await callCbmTool("get_architecture", args, this.processOptions);
    const files = collectReturnedPaths(raw);
    const coverage = await this.coverage(context.project.name, files);
    const data: SemanticArchitectureData = { summary: raw, rawEvidence: raw };
    return semanticResult(
      this.name,
      "cbm",
      data,
      this.provenance(context.root, context.version, context.project.name, context.status, files, coverage),
      coverageWarnings(coverage)
    );
  }

  async detectChanges(repoPath: string, baseBranch = "main"): Promise<SemanticResult<SemanticChangeData>> {
    const context = await this.context(repoPath);
    const raw = await callCbmTool(
      "detect_changes",
      { project: context.project.name, base_branch: baseBranch, format: "json" },
      this.processOptions
    );
    const files = collectReturnedPaths(raw);
    const coverage = await this.coverage(context.project.name, files);
    const data: SemanticChangeData = { changes: raw, rawEvidence: raw };
    return semanticResult(
      this.name,
      "cbm",
      data,
      this.provenance(context.root, context.version, context.project.name, context.status, files, coverage),
      coverageWarnings(coverage)
    );
  }

  private async context(repoPath: string): Promise<CbmContext> {
    const root = canonicalRepoRoot(repoPath);
    const version = await this.version();
    const project = await this.requireProject(root);
    const status = await this.projectStatus(root, project);
    if (numberValue(status.nodes) <= 0 || stringValue(status.status) !== "ready") {
      throw new SemanticBackendError("not_indexed", "CBM project is not ready for semantic queries.", {
        project: project.name,
        status
      });
    }
    return { root, version, project, status };
  }

  private async version(): Promise<string> {
    if (!this.versionPromise) {
      this.versionPromise = readCbmVersion(this.processOptions)
        .then((version) => {
          if (version !== SUPPORTED_CBM_VERSION) {
            throw new SemanticBackendError(
              "unsupported_version",
              `Unsupported CBM version ${version}; ProjectNavigator requires exactly ${SUPPORTED_CBM_VERSION}.`,
              { version, supportedVersion: SUPPORTED_CBM_VERSION }
            );
          }
          return version;
        })
        .catch((error) => {
          this.versionPromise = null;
          throw error;
        });
    }
    return await this.versionPromise;
  }

  private async requireProject(root: string): Promise<CbmProject> {
    const project = await this.findProject(root);
    if (!project) {
      throw new SemanticBackendError("not_indexed", "No CBM project matches the repository canonical root.", {
        repoRoot: root
      });
    }
    return project;
  }

  private async findProject(root: string): Promise<CbmProject | null> {
    const raw = await callCbmTool("list_projects", {}, this.processOptions);
    if (!Array.isArray(raw.projects)) {
      throw new SemanticBackendError("invalid_response", "CBM list_projects did not return a projects array.");
    }
    const matches = raw.projects.filter(isRecord).flatMap((entry) => {
      const name = stringValue(entry.name);
      const rootPath = stringValue(entry.root_path);
      if (!name || !rootPath || canonicalRepoRoot(rootPath) !== root) {
        return [];
      }
      return [{ name, rootPath, nodes: nullableNumber(entry.nodes), edges: nullableNumber(entry.edges) }];
    });
    if (matches.length > 1) {
      throw new SemanticBackendError(
        "root_mismatch",
        "Multiple CBM projects claim the same canonical repository root.",
        {
          repoRoot: root,
          projects: matches.map((project) => project.name)
        }
      );
    }
    return matches[0] ?? null;
  }

  private async projectStatus(root: string, project: CbmProject): Promise<Record<string, unknown>> {
    const status = await callCbmTool("index_status", { project: project.name, verbose: true }, this.processOptions);
    const statusRoot = stringValue(status.root_path);
    if (!statusRoot || canonicalRepoRoot(statusRoot) !== root) {
      throw new SemanticBackendError(
        "root_mismatch",
        "CBM index_status root does not match the requested repository.",
        {
          repoRoot: root,
          project: project.name,
          statusRoot: statusRoot || null
        }
      );
    }
    return status;
  }

  private async coverage(project: string, files: string[]): Promise<Record<string, unknown> | null> {
    const uniqueFiles = Array.from(new Set(files.filter(Boolean))).sort();
    if (uniqueFiles.length === 0) {
      return null;
    }
    const batches: Record<string, unknown>[] = [];
    for (let offset = 0; offset < uniqueFiles.length; offset += COVERAGE_BATCH_SIZE) {
      batches.push(
        await callCbmTool(
          "check_index_coverage",
          { project, paths: uniqueFiles.slice(offset, offset + COVERAGE_BATCH_SIZE) },
          this.processOptions
        )
      );
    }
    if (batches.length === 1) {
      return batches[0];
    }
    return {
      signal: "best_effort",
      indexed_at: nullableString(batches[0]?.indexed_at),
      paths: batches.flatMap((batch) => (Array.isArray(batch.paths) ? batch.paths : [])),
      metadata: batches[0]?.metadata ?? null,
      caveat: stringValue(batches[0]?.caveat),
      batches: batches.length
    };
  }

  private provenance(
    root: string,
    version: string | null,
    project: string | null,
    status: Record<string, unknown> | null,
    files: string[],
    coverage: Record<string, unknown> | null
  ): SemanticProvenance {
    const gitSha = currentGitSha(root);
    const indexedAt = nullableString(coverage?.indexed_at) ?? this.indexedAtByRoot.get(root) ?? null;
    let freshness: SemanticProvenance["freshness"];
    if (!project) {
      freshness = "unindexed";
    } else {
      freshness = freshnessFromCoverage(coverage);
      if (freshness === "unknown" && this.indexedAtByRoot.has(root)) {
        freshness = coverageFreshness(extractCoverage(status));
      }
    }
    return {
      backend: this.name,
      backendVersion: version,
      contractVersion: 1,
      authority: "supporting_evidence_only",
      repoRoot: root,
      project,
      gitSha,
      indexedAt,
      queriedAt: new Date().toISOString(),
      freshness,
      coverage,
      ...hashRepoFiles(root, files)
    };
  }
}

function parseSearchRows(raw: Record<string, unknown>): SemanticSymbolHit[] {
  if (!Array.isArray(raw.cols)) {
    throw new SemanticBackendError("invalid_response", "CBM search_graph JSON is missing cols.");
  }
  const cols = raw.cols.map(String);
  if (Array.isArray(raw.rows)) {
    return raw.rows.map((row) => parseFlatSearchRow(row, cols));
  }
  if (!Array.isArray(raw.groups)) {
    throw new SemanticBackendError("invalid_response", "CBM search_graph JSON is missing rows or groups.");
  }
  return raw.groups.filter(isRecord).flatMap((group) => {
    if (!Array.isArray(group.rows)) {
      throw new SemanticBackendError("invalid_response", "CBM search_graph group is missing rows.");
    }
    const prefix = stringValue(group.qn_prefix);
    const file = nullableString(group.file);
    return group.rows.map((row) => {
      if (!Array.isArray(row)) {
        throw new SemanticBackendError("invalid_response", "CBM search_graph row is not an array.");
      }
      const name = stringAt(row, cols, "name");
      if (!name) {
        throw new SemanticBackendError("invalid_response", "CBM search_graph row is missing a symbol name.");
      }
      const [startLine, endLine] = parseLines(valueAt(row, cols, "lines"));
      return {
        name,
        qualifiedName: prefix ? `${prefix}.${name}` : name,
        kind: stringAt(row, cols, "label") || "Unknown",
        path: file,
        startLine,
        endLine,
        score: nullableNumber(valueAt(row, cols, "score")),
        inDegree: nullableNumber(valueAt(row, cols, "in")),
        outDegree: nullableNumber(valueAt(row, cols, "out"))
      };
    });
  });
}

function parseFlatSearchRow(row: unknown, cols: string[]): SemanticSymbolHit {
  if (!Array.isArray(row)) {
    throw new SemanticBackendError("invalid_response", "CBM search_graph row is not an array.");
  }
  const qualifiedName = stringAt(row, cols, "qn") || stringAt(row, cols, "qualified_name");
  const name = stringAt(row, cols, "name") || qualifiedName.split(".").at(-1) || "";
  if (!name) {
    throw new SemanticBackendError("invalid_response", "CBM search_graph row is missing a symbol name.");
  }
  const [startLine, endLine] = parseLines(valueAt(row, cols, "lines"));
  return {
    name,
    qualifiedName: qualifiedName || name,
    kind: stringAt(row, cols, "label") || "Unknown",
    path: nullableString(valueAt(row, cols, "file")),
    startLine,
    endLine,
    score: nullableNumber(valueAt(row, cols, "score")) ?? nullableNumber(valueAt(row, cols, "rank")),
    inDegree: nullableNumber(valueAt(row, cols, "in")),
    outDegree: nullableNumber(valueAt(row, cols, "out"))
  };
}

function parseTraceSection(section: unknown): SemanticTraceHit[] {
  if (section === undefined || section === null) {
    return [];
  }
  if (!isRecord(section) || !Array.isArray(section.cols) || !Array.isArray(section.groups)) {
    throw new SemanticBackendError("invalid_response", "CBM trace_path section is missing cols or groups.");
  }
  const cols = section.cols.map(String);
  return section.groups.filter(isRecord).flatMap((group) => {
    if (!Array.isArray(group.rows)) {
      throw new SemanticBackendError("invalid_response", "CBM trace_path group is missing rows.");
    }
    const prefix = stringValue(group.qn_prefix);
    const file = nullableString(group.file);
    return group.rows.map((row) => {
      if (!Array.isArray(row)) {
        throw new SemanticBackendError("invalid_response", "CBM trace_path row is not an array.");
      }
      const name = stringAt(row, cols, "name");
      if (!name) {
        throw new SemanticBackendError("invalid_response", "CBM trace_path row is missing a symbol name.");
      }
      return {
        name,
        qualifiedName: prefix ? `${prefix}.${name}` : name,
        path: file,
        hop: integerValue(valueAt(row, cols, "hop"), 0),
        strategy: nullableString(valueAt(row, cols, "strategy")),
        confidence: nullableNumber(valueAt(row, cols, "confidence"))
      };
    });
  });
}

function collectReturnedPaths(value: unknown): string[] {
  const results = new Set<string>();
  visit(value, null, results);
  return Array.from(results).sort();
}

function visit(value: unknown, key: string | null, results: Set<string>): void {
  if (typeof value === "string") {
    if (key && isPathKey(key) && looksLikePath(value)) {
      results.add(value.replaceAll("\\", "/"));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, key, results);
    }
    return;
  }
  if (isRecord(value)) {
    collectTablePaths(value, results);
    for (const [childKey, child] of Object.entries(value)) {
      visit(child, childKey, results);
    }
  }
}

function collectTablePaths(table: Record<string, unknown>, results: Set<string>): void {
  if (!Array.isArray(table.cols) || !Array.isArray(table.rows)) {
    return;
  }
  const pathColumns = table.cols.map(String).flatMap((column, index) => (isPathKey(column) ? [index] : []));
  if (pathColumns.length === 0) {
    return;
  }
  for (const row of table.rows) {
    if (!Array.isArray(row)) {
      continue;
    }
    for (const index of pathColumns) {
      const candidate = row[index];
      if (typeof candidate === "string" && looksLikePath(candidate)) {
        results.add(candidate.replaceAll("\\", "/"));
      }
    }
  }
}

function isPathKey(key: string): boolean {
  return /^(?:file|path|file_path|route_file|changed_files)$/i.test(key);
}

function looksLikePath(value: string): boolean {
  return value.length > 0 && !value.includes("\0") && (value.includes("/") || /\.[A-Za-z0-9]{1,12}$/.test(value));
}

function assertNoRepositoryArtifact(repoRoot: string): void {
  const artifactPaths = repositoryArtifactPaths(repoRoot);
  if (artifactPaths.length > 0) {
    throw new SemanticBackendError(
      "artifact_conflict",
      "Refusing CBM indexing because a repository artifact may be imported or refreshed even with persistence disabled.",
      { artifacts: artifactPaths }
    );
  }
}

function repositoryArtifactPaths(repoRoot: string): string[] {
  return [".codebase-memory/graph.db.zst", ".codebase-memory/artifact.json"].filter((artifact) =>
    existsSync(path.join(repoRoot, artifact))
  );
}

function worktreeSnapshot(repoRoot: string): WorktreeSnapshot {
  try {
    const porcelain = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const pathFingerprints = Object.fromEntries(
      porcelainPaths(porcelain)
        .sort()
        .map((relativePath) => [relativePath, fingerprintPath(path.resolve(repoRoot, relativePath))])
    );
    const fingerprint = createHash("sha256")
      .update(porcelain)
      .update("\0")
      .update(JSON.stringify(pathFingerprints))
      .digest("hex");
    return { porcelain, fingerprint, pathFingerprints };
  } catch (error) {
    throw new SemanticBackendError("tool_error", "Unable to capture Git worktree state for CBM indexing.", {
      cause: semanticErrorMessage(error)
    });
  }
}

function porcelainPaths(porcelain: string): string[] {
  const fields = porcelain.split("\0");
  const paths = new Set<string>();
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (!entry) {
      continue;
    }
    if (entry.length < 4 || entry[2] !== " ") {
      throw new Error("Git returned malformed porcelain output.");
    }
    const status = entry.slice(0, 2);
    paths.add(entry.slice(3));
    if (status.includes("R") || status.includes("C")) {
      const sourcePath = fields[index + 1];
      if (!sourcePath) {
        throw new Error("Git returned an incomplete rename or copy entry.");
      }
      paths.add(sourcePath);
      index += 1;
    }
  }
  return Array.from(paths);
}

function fingerprintPath(absolutePath: string): string {
  try {
    const stats = lstatSync(absolutePath);
    const metadata = `${stats.mode}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`;
    if (stats.isSymbolicLink()) {
      return `symlink:${metadata}:${readlinkSync(absolutePath)}`;
    }
    if (!stats.isFile()) {
      return `${stats.isDirectory() ? "directory" : "special"}:${metadata}`;
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    const descriptor = openSync(absolutePath, "r");
    try {
      let bytesRead: number;
      do {
        bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
        if (bytesRead > 0) {
          hash.update(buffer.subarray(0, bytesRead));
        }
      } while (bytesRead > 0);
    } finally {
      closeSync(descriptor);
    }
    return `file:${metadata}:${hash.digest("hex")}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}

function changedSnapshotPaths(before: WorktreeSnapshot, after: WorktreeSnapshot): string[] {
  return Array.from(new Set([...Object.keys(before.pathFingerprints), ...Object.keys(after.pathFingerprints)]))
    .filter((relativePath) => before.pathFingerprints[relativePath] !== after.pathFingerprints[relativePath])
    .sort();
}

function extractCoverage(status: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!status) {
    return null;
  }
  const keys = ["parse_partial", "skipped", "not_indexed", "coverage_note"];
  const entries = keys.flatMap((key) => (status[key] === undefined ? [] : ([[key, status[key]]] as const)));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function coveragePaths(coverage: Record<string, unknown> | null): string[] {
  return coverage ? collectReturnedPaths(coverage) : [];
}

function coverageFreshness(coverage: Record<string, unknown> | null): SemanticProvenance["freshness"] {
  if (!coverage) {
    return "fresh";
  }
  const parsePartial = isRecord(coverage.parse_partial) ? numberValue(coverage.parse_partial.count) : 0;
  const skipped = isRecord(coverage.skipped) ? numberValue(coverage.skipped.count) : 0;
  return skipped > 0 ? "weak" : parsePartial > 0 ? "partial" : "fresh";
}

function coverageWarnings(coverage: Record<string, unknown> | null): string[] {
  if (!coverage || !Array.isArray(coverage.paths)) {
    return [];
  }
  const paths = coverage.paths.filter(isRecord);
  const gaps = paths.filter(
    (row) => !["no_recorded_issue", "indexed_no_recorded_gap"].includes(stringValue(row.status))
  );
  const stale = paths.filter((row) => stringValue(row.freshness) !== "metadata_match");
  return [
    ...(gaps.length > 0
      ? [`CBM reports coverage gaps or unavailable coverage for ${gaps.length} returned path(s).`]
      : []),
    ...(stale.length > 0 ? [`CBM metadata does not match ${stale.length} returned path(s); read source directly.`] : [])
  ];
}

function valueAt(row: unknown[], cols: string[], name: string): unknown {
  const index = cols.indexOf(name);
  return index >= 0 ? row[index] : undefined;
}

function stringAt(row: unknown[], cols: string[], name: string): string {
  return stringValue(valueAt(row, cols, name));
}

function parseLines(value: unknown): [number | null, number | null] {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return [value, value];
  }
  if (typeof value !== "string") {
    return [null, null];
  }
  const match = value.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    return [null, null];
  }
  return [Number(match[1]), Number(match[2] ?? match[1])];
}

function errorVersion(error: unknown): string | null {
  return error instanceof SemanticBackendError && typeof error.details.version === "string"
    ? error.details.version
    : null;
}

function errorDetails(error: unknown): Record<string, unknown> | null {
  return error instanceof SemanticBackendError ? { code: error.code, ...error.details } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}
