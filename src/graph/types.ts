export interface FileHit {
  path: string;
  language?: string;
  score: number;
  reason: string;
}

export interface SymbolHit {
  name: string;
  kind: string;
  signature?: string | null;
  qualifiedName?: string | null;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
}

export interface CommandHit {
  name: string;
  command: string;
  sourceFile: string;
  category: string;
  confidence?: number;
  reason?: string;
}

export interface RuleHit {
  sourceFile: string;
  title: string | null;
  body: string;
  category: string;
  score?: number;
}

export interface RepoMap {
  repo: string;
  rootPath: string;
  gitSha: string | null;
  languages: Array<{ language: string; files: number }>;
  counts: {
    files: number;
    symbols: number;
    routes: number;
    tests: number;
    commands: number;
    rules: number;
    memories: number;
  };
  importantPaths: string[];
  commands: CommandHit[];
  recentScanStatus: string | null;
}

export interface RelatedFilesResult {
  files: FileHit[];
}

export interface RouteHit {
  framework: string;
  method: string | null;
  path: string;
  name: string | null;
  routeFile: string | null;
  targetSymbol: string | null;
}

export interface ImpactResult {
  target: string;
  impactedFiles: Array<{
    path: string;
    relationship: string;
    confidence: number;
    score: number;
    distance: number;
    pathChain: string[];
  }>;
  risks: string[];
}

export interface RelatedTestsResult {
  commands: CommandHit[];
  testFiles: string[];
}
