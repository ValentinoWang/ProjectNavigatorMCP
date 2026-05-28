export interface ScannedFile {
  path: string;
  language: string;
  size: number;
  hash: string;
}

export interface ScannedSymbol {
  filePath: string;
  name: string;
  kind: string;
  signature: string | null;
  qualifiedName: string | null;
  containerName?: string | null;
  parameters?: string[];
  returnType?: string | null;
  visibility?: string | null;
  bodyStartLine?: number | null;
  bodyEndLine?: number | null;
  languageKind?: string | null;
  startLine: number;
  endLine: number;
}

export interface ScannedImport {
  fromPath: string;
  importText: string;
}

export interface ScannedRoute {
  framework: string;
  method: string | null;
  path: string;
  name: string | null;
  filePath: string;
  symbolName: string | null;
}

export interface ScannedCommand {
  name: string;
  command: string;
  sourceFile: string;
  category: string;
}

export interface ScannedRule {
  sourceFile: string;
  title: string | null;
  body: string;
  category: string;
}

export interface CoChange {
  fromPath: string;
  toPath: string;
  weight: number;
}

export type IncrementalChangeKind =
  | "none"
  | "workflow_profiles_only"
  | "eval_only"
  | "commands_only"
  | "docs_only"
  | "code_graph"
  | "mixed";

export interface IncrementalChangePlanes {
  workflowProfiles: string[];
  evalSuites: string[];
  commandSources: string[];
  docs: string[];
  codeGraph: string[];
  deleted: string[];
}

export interface GraphFreshness {
  fileCatalog: "fresh" | "partial" | "stale";
  symbolGraph: "fresh" | "partial" | "stale";
  importGraph: "fresh" | "partial" | "stale";
  routeGraph: "fresh" | "partial" | "stale";
  testGraph: "fresh" | "partial" | "stale";
  duplicateClusters: "fresh" | "partial" | "stale";
  coChangeGraph: "fresh" | "stale_until_full_scan";
}

export interface AffectedCallerExpansion {
  enabled: boolean;
  changedFiles: number;
  candidateCallers: number;
  reindexedCallers: number;
  skippedCallers: number;
  staleIncomingEdges: number;
  reason: string;
}

export interface PartialVerification {
  enabled: boolean;
  passed: boolean;
  differences: string[];
  allowedDifferences: string[];
}

export interface ScanResult {
  repoRoot: string;
  gitSha: string | null;
  files: number;
  symbols: number;
  imports: number;
  routes: number;
  tests: number;
  commands: number;
  rules: number;
  documents: number;
  coChanges: number;
  incremental?: {
    mode: "full" | "incremental";
    filesTotal: number;
    filesChanged: number;
    filesSkipped: number;
    filesDeleted: number;
    durationMs: number;
    changedPaths: string[];
    deletedPaths: string[];
    changeKind: IncrementalChangeKind;
    changePlanes: IncrementalChangePlanes;
    changePlaneCounts: Record<keyof IncrementalChangePlanes, number>;
    actions: string[];
    codeGraphStale: boolean;
    codeGraphStaleReason?: string;
    partialGraphUpdate: boolean;
    partialGraphVersion?: 2;
    changedCodeFiles: number;
    deletedCodeFiles: number;
    invalidatedFiles: number;
    reindexedFiles: number;
    staleEdges: number;
    fallbackReason?: string;
    affectedCallerExpansion: AffectedCallerExpansion;
    freshness: GraphFreshness;
    partialVerification?: PartialVerification;
    stages: string[];
    conservativeFullRebuild: boolean;
  };
}
