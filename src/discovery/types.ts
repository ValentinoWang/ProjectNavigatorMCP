import type { FileHit, RelatedTestsResult, RouteHit, SymbolHit } from "../graph/types.js";
import type { AuthoritativeHandoff } from "./authoritativeChain.js";

export interface EvidenceItem {
  type: string;
  detail: string;
  score?: number;
}

export interface EntrypointHit {
  type: string;
  symbol: string | null;
  path: string;
  routePath?: string | null;
  method?: string | null;
  score: number;
  why: string;
  evidence: EvidenceItem[];
  scoreBreakdown?: Record<string, number>;
}

export interface SymbolTraceHit {
  symbol: string;
  qualifiedName: string | null;
  kind: string;
  path: string;
  startLine: number;
  endLine: number;
  confidence: number;
  why: string;
  evidence: EvidenceItem[];
}

export interface SimilarCodeHit {
  symbol: string | null;
  qualifiedName: string | null;
  path: string;
  similarity: number;
  reuseType: string;
  why: string;
  verdict?: "reuse_as_is" | "extend_existing" | "extract_shared" | "create_new_allowed";
  suggestion?: string;
  scoreBreakdown?: Record<string, number>;
}

export interface ModuleHit {
  name: string;
  root: string;
  moduleType: string;
  summary: string | null;
  entrypoints: EntrypointHit[];
  coreFiles: string[];
  dependencies: string[];
  dependents: string[];
  tests: string[];
  duplicateClusters: SimilarCodeHit[];
}

export interface WhyRelatedResult {
  target: string;
  task: string;
  score: number;
  evidence: EvidenceItem[];
}

export interface DiscoveryResult {
  mode: "discovery";
  task: string;
  authoritativeHandoff: AuthoritativeHandoff;
  entrypoints: EntrypointHit[];
  coreSymbols: SymbolHit[];
  callGraphPreview: Array<{ from: string; to: string; kind: string; confidence: number; evidence: EvidenceItem[] }>;
  reuseCandidates: SimilarCodeHit[];
  duplicateRisks: SimilarCodeHit[];
  impactPreview: FileHit[];
  recommendedReadOrder: FileHit[];
  mustRead: FileHit[];
  shouldInspect: FileHit[];
  reuseBeforeCreate: SimilarCodeHit[];
  ignoreForNow: FileHit[];
  whyRelated: WhyRelatedResult[];
  relatedTests: RelatedTestsResult;
  warnings: string[];
}

export interface DiscoveryTimingBreakdown {
  workflowProfilesMs: number;
  entrypointsMs: number;
  relatedFilesMs: number;
  symbolsMs: number;
  reuseMs: number;
  relatedTestsMs: number;
  callGraphMs: number;
  readOrderMs: number;
  handoffMs: number;
  whyRelatedMs: number;
  totalMs: number;
}
