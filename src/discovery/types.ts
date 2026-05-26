import type { CommandHit, FileHit, RouteHit, SymbolHit } from "../graph/types.js";

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
  entrypoints: EntrypointHit[];
  coreSymbols: SymbolHit[];
  callGraphPreview: Array<{ from: string; to: string; kind: string; confidence: number; evidence: EvidenceItem[] }>;
  reuseCandidates: SimilarCodeHit[];
  duplicateRisks: SimilarCodeHit[];
  impactPreview: FileHit[];
  recommendedReadOrder: FileHit[];
  whyRelated: WhyRelatedResult[];
  relatedTests: {
    commands: CommandHit[];
    testFiles: string[];
  };
  warnings: string[];
}
