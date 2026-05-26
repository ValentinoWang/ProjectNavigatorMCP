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
}
