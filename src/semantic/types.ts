import type { EvidenceFreshness } from "../graph/freshnessPolicy.js";

export type SemanticBackendPreference = "auto" | "cbm" | "builtin";
export type SemanticBackendName = "codebase-memory" | "builtin";
export type SemanticAuthority = "supporting_evidence_only";

export interface SemanticFileHashCoverage {
  candidateCount: number;
  hashedCount: number;
  limit: number;
  truncated: boolean;
}

export interface SemanticBackendOptions {
  preference?: SemanticBackendPreference;
  cbmBinary?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface SemanticProvenance {
  backend: SemanticBackendName;
  backendVersion: string | null;
  contractVersion: 1;
  authority: SemanticAuthority;
  repoRoot: string;
  project: string | null;
  gitSha: string | null;
  indexedAt: string | null;
  queriedAt: string;
  freshness: EvidenceFreshness | "unknown" | "unindexed";
  coverage: Record<string, unknown> | null;
  fileHashes: Record<string, string>;
  fileHashCoverage: SemanticFileHashCoverage;
}

export interface SemanticResult<T> {
  ok: boolean;
  selectedBackend: SemanticBackendName;
  requestedBackend: SemanticBackendPreference;
  fallback: {
    used: boolean;
    from: SemanticBackendName | null;
    reason: string | null;
  };
  data: T;
  provenance: SemanticProvenance;
  warnings: string[];
}

export interface SemanticBackendStatus {
  available: boolean;
  indexed: boolean;
  binary: string | null;
  version: string | null;
  project: string | null;
  status: string;
  reason: string | null;
  rawStatus: Record<string, unknown> | null;
}

export interface SemanticSymbolHit {
  name: string;
  qualifiedName: string | null;
  kind: string;
  path: string | null;
  startLine: number | null;
  endLine: number | null;
  score: number | null;
  inDegree: number | null;
  outDegree: number | null;
}

export interface SemanticSearchData {
  query: string;
  symbols: SemanticSymbolHit[];
  total: number;
  hasMore: boolean;
  rawEvidence?: Record<string, unknown>;
}

export interface SemanticTraceHit {
  name: string;
  qualifiedName: string | null;
  path: string | null;
  hop: number;
  strategy: string | null;
  confidence: number | null;
}

export interface SemanticTraceData {
  symbol: string;
  direction: "inbound" | "outbound" | "both";
  callers: SemanticTraceHit[];
  callees: SemanticTraceHit[];
  truncated: boolean;
  nextCursor: string | null;
  rawEvidence?: Record<string, unknown>;
}

export interface SemanticArchitectureData {
  summary: Record<string, unknown>;
  rawEvidence?: Record<string, unknown>;
}

export interface SemanticChangeData {
  changes: Record<string, unknown>;
  rawEvidence?: Record<string, unknown>;
}

export interface SemanticIndexData {
  indexed: boolean;
  project: string | null;
  status: Record<string, unknown> | null;
}

export interface SemanticBackend {
  readonly name: SemanticBackendName;
  status(repoPath: string): Promise<SemanticResult<SemanticBackendStatus>>;
  index(repoPath: string): Promise<SemanticResult<SemanticIndexData>>;
  search(repoPath: string, query: string, limit: number): Promise<SemanticResult<SemanticSearchData>>;
  trace(
    repoPath: string,
    query: string,
    direction: "inbound" | "outbound" | "both",
    depth: number,
    limit: number
  ): Promise<SemanticResult<SemanticTraceData>>;
  architecture(repoPath: string, scope?: string): Promise<SemanticResult<SemanticArchitectureData>>;
  detectChanges(repoPath: string, baseBranch?: string): Promise<SemanticResult<SemanticChangeData>>;
}
