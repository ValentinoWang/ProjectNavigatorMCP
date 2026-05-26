import path from "node:path";

export interface ImportBinding {
  importedName: string | null;
  localName: string | null;
  sourceText: string;
  resolvedPath: string | null;
  confidence: number;
  evidence: string[];
}

export function parseImportBindings(fromPath: string, importText: string, filePaths: Set<string>): ImportBinding[] {
  const resolvedPath = resolveImportPathV2(fromPath, importText, filePaths);
  return [
    {
      importedName: importedNameFromText(importText),
      localName: localNameFromText(importText),
      sourceText: importText,
      resolvedPath,
      confidence: resolvedPath ? confidenceForImport(importText) : 0.25,
      evidence: resolvedPath ? evidenceForImport(importText) : ["unresolved"]
    }
  ];
}

export function resolveImportPathV2(fromPath: string, importText: string, filePaths: Set<string>): string | null {
  const candidates: string[] = [];
  if (importText.startsWith(".") || /^[^:/]+?\.(dart|ts|tsx|js|jsx|py)$/.test(importText)) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), importText));
    candidates.push(base, ...withExtensions(base), `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`);
  } else if (importText.startsWith("package:")) {
    const withoutPackage = importText.replace(/^package:[^/]+\//, "");
    candidates.push(`frontend/lib/${withoutPackage}`);
  } else {
    const dotted = importText.replaceAll(".", "/");
    candidates.push(`${dotted}.py`, `backend/${dotted}.py`, `backend/app/${dotted}.py`, `src/${dotted}.ts`);
  }
  return candidates.find((candidate) => filePaths.has(candidate)) ?? null;
}

function withExtensions(base: string): string[] {
  return [".ts", ".tsx", ".js", ".jsx", ".dart", ".py"].map((ext) => `${base}${ext}`);
}

function confidenceForImport(importText: string): number {
  if (importText.startsWith(".") || /^[^:/]+?\.(dart|ts|tsx|js|jsx|py)$/.test(importText)) {
    return 0.85;
  }
  if (importText.startsWith("package:")) {
    return 0.78;
  }
  return 0.62;
}

function evidenceForImport(importText: string): string[] {
  if (importText.startsWith(".") || /^[^:/]+?\.(dart|ts|tsx|js|jsx|py)$/.test(importText)) {
    return ["import_resolved", "relative_import"];
  }
  if (importText.startsWith("package:")) {
    return ["import_resolved", "dart_package_import"];
  }
  return ["same_module"];
}

function importedNameFromText(importText: string): string | null {
  if (importText.startsWith("package:") || importText.startsWith(".") || importText.includes("/")) {
    return path.posix.basename(importText).replace(/\.[^.]+$/, "") || null;
  }
  return importText.split(".").at(-1) ?? null;
}

function localNameFromText(importText: string): string | null {
  return importedNameFromText(importText);
}
