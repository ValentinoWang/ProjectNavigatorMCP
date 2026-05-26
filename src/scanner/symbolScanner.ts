import type { ScannedImport, ScannedRoute, ScannedSymbol } from "./types.js";
import { findBraceBlockEnd, findIndentBlockEnd, leadingSpaces } from "../analysis/bodyExtractor.js";

export interface SymbolScanResult {
  symbols: ScannedSymbol[];
  imports: ScannedImport[];
  routes: ScannedRoute[];
}

export function scanTextSymbols(filePath: string, language: string, content: string): SymbolScanResult {
  if (language === "dart") {
    return scanDart(filePath, content);
  }
  if (language === "python") {
    return scanPython(filePath, content);
  }
  if (language === "typescript" || language === "javascript") {
    return scanTypeScript(filePath, content);
  }
  return { symbols: [], imports: [], routes: [] };
}

function scanDart(filePath: string, content: string): SymbolScanResult {
  const lines = content.split(/\r?\n/);
  const symbols: ScannedSymbol[] = [];
  const imports: ScannedImport[] = [];
  const routes: ScannedRoute[] = [];
  let currentClass: { name: string; endLine: number } | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (currentClass && lineNumber > currentClass.endLine) {
      currentClass = null;
    }
    const classMatch = line.match(
      /^\s*(?:abstract\s+|base\s+|final\s+|sealed\s+)?(?:class|mixin|enum|extension)\s+([A-Za-z_][A-Za-z0-9_]*)/
    );
    if (classMatch) {
      const endLine = findBraceBlockEnd(lines, index);
      currentClass = { name: classMatch[1], endLine };
      symbols.push(symbol(filePath, classMatch[1], "class", lineNumber, endLine, line.trim(), null, "dart"));
    }

    const functionMatch = line.match(
      /^\s*(?:[A-Za-z_<>,.?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^;]*)\)\s*(?:async\s*)?[{=>]/
    );
    if (functionMatch && !["if", "for", "while", "switch"].includes(functionMatch[1])) {
      const endLine = findBraceBlockEnd(lines, index);
      const containerName = currentClass?.endLine && lineNumber <= currentClass.endLine ? currentClass.name : null;
      symbols.push(
        symbol(
          filePath,
          functionMatch[1],
          containerName ? "method" : "function",
          lineNumber,
          endLine,
          line.trim(),
          containerName,
          "dart",
          parametersFromSignature(functionMatch[2])
        )
      );
    }

    const providerMatch = line.match(/\b(?:final|var)\s+([A-Za-z_][A-Za-z0-9_]*Provider)\s*=/);
    if (providerMatch) {
      symbols.push(symbol(filePath, providerMatch[1], "provider", lineNumber, lineNumber, line.trim(), null, "dart"));
    }

    const importMatch = line.match(/^\s*import\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      imports.push({ fromPath: filePath, importText: importMatch[1] });
    }

    if (line.includes("GoRoute(")) {
      const nearby = lines.slice(index, Math.min(lines.length, index + 10)).join("\n");
      const name =
        nearby.match(/name:\s*['"]([^'"]+)['"]/)?.[1] ?? nearby.match(/name:\s*([A-Za-z0-9_.]+)/)?.[1] ?? null;
      const routePath =
        nearby.match(/path:\s*['"]([^'"]+)['"]/)?.[1] ?? nearby.match(/path:\s*([A-Za-z0-9_.]+)/)?.[1] ?? null;
      if (name || routePath) {
        routes.push({
          framework: "flutter_go_router",
          method: null,
          path: routePath ?? name ?? "unknown",
          name,
          filePath,
          symbolName: name
        });
      }
    }
  });

  return { symbols, imports, routes: dedupeRoutes(routes) };
}

function scanPython(filePath: string, content: string): SymbolScanResult {
  const lines = content.split(/\r?\n/);
  const symbols: ScannedSymbol[] = [];
  const imports: ScannedImport[] = [];
  const routes: ScannedRoute[] = [];
  let currentClass: { name: string; indent: number; endLine: number } | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (
      currentClass &&
      (lineNumber > currentClass.endLine || (line.trim() && leadingSpaces(line) <= currentClass.indent))
    ) {
      currentClass = null;
    }
    const classMatch = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (classMatch) {
      const endLine = findIndentBlockEnd(lines, index);
      currentClass = { name: classMatch[1], indent: leadingSpaces(line), endLine };
      symbols.push(symbol(filePath, classMatch[1], "class", lineNumber, endLine, line.trim(), null, "python"));
    }

    const defMatch = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?/);
    if (defMatch) {
      const endLine = findIndentBlockEnd(lines, index);
      const containerName =
        currentClass && leadingSpaces(line) > currentClass.indent && lineNumber <= currentClass.endLine
          ? currentClass.name
          : null;
      symbols.push(
        symbol(
          filePath,
          defMatch[1],
          containerName ? "method" : "function",
          lineNumber,
          endLine,
          line.trim(),
          containerName,
          "python",
          parametersFromSignature(defMatch[2]),
          defMatch[3]?.trim() ?? null
        )
      );
    }

    const importMatch = line.match(/^\s*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.]+))/);
    if (importMatch) {
      imports.push({ fromPath: filePath, importText: importMatch[1] ?? importMatch[2] });
    }

    const routeMatch = line.match(/^\s*@(?:router|app)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/);
    if (routeMatch) {
      const handler =
        lines
          .slice(index + 1, Math.min(lines.length, index + 6))
          .join("\n")
          .match(/(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)?.[1] ?? null;
      routes.push({
        framework: "fastapi",
        method: routeMatch[1].toUpperCase(),
        path: routeMatch[2],
        name: handler,
        filePath,
        symbolName: handler
      });
    }
  });

  return { symbols, imports, routes };
}

function scanTypeScript(filePath: string, content: string): SymbolScanResult {
  const lines = content.split(/\r?\n/);
  const symbols: ScannedSymbol[] = [];
  const imports: ScannedImport[] = [];
  const routes: ScannedRoute[] = [];
  let currentClass: { name: string; endLine: number } | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (currentClass && lineNumber > currentClass.endLine) {
      currentClass = null;
    }
    const classMatch = line.match(/^\s*export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)|^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    const className = classMatch?.[1] ?? classMatch?.[2];
    if (className) {
      const endLine = findBraceBlockEnd(lines, index);
      currentClass = { name: className, endLine };
      symbols.push(symbol(filePath, className, "class", lineNumber, endLine, line.trim(), null, "typescript"));
    }

    const functionMatch = line.match(
      /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/
    );
    if (functionMatch) {
      symbols.push(
        symbol(
          filePath,
          functionMatch[1],
          "function",
          lineNumber,
          findBraceBlockEnd(lines, index),
          line.trim(),
          null,
          "typescript",
          parametersFromSignature(functionMatch[2])
        )
      );
    }

    const constFunctionMatch = line.match(
      /^\s*(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(([^)]*)\)/
    );
    if (constFunctionMatch) {
      const name = constFunctionMatch[1];
      symbols.push(
        symbol(
          filePath,
          name,
          isLikelyReactComponent(name) ? "component" : name.startsWith("use") ? "hook" : "function",
          lineNumber,
          findBraceBlockEnd(lines, index),
          line.trim(),
          null,
          "typescript",
          parametersFromSignature(constFunctionMatch[2])
        )
      );
    }

    const methodMatch = line.match(
      /^\s*(?:public\s+|private\s+|protected\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*[:{]/
    );
    if (methodMatch && currentClass && !["if", "for", "while", "switch"].includes(methodMatch[1])) {
      symbols.push(
        symbol(
          filePath,
          methodMatch[1],
          "method",
          lineNumber,
          findBraceBlockEnd(lines, index),
          line.trim(),
          currentClass.name,
          "typescript",
          parametersFromSignature(methodMatch[2])
        )
      );
    }

    const importMatch = line.match(/^\s*import(?:.+from\s+)?["']([^"']+)["']/);
    if (importMatch) {
      imports.push({ fromPath: filePath, importText: importMatch[1] });
    }
  });

  return { symbols, imports, routes };
}

function symbol(
  filePath: string,
  name: string,
  kind: string,
  startLine: number,
  endLine: number,
  signature: string,
  containerName: string | null,
  languageKind: string,
  parameters: string[] = [],
  returnType: string | null = null
): ScannedSymbol {
  return {
    filePath,
    name,
    kind,
    signature,
    qualifiedName: containerName ? `${containerName}.${name}` : name,
    containerName,
    parameters,
    returnType,
    visibility: name.startsWith("_") ? "private" : "public",
    bodyStartLine: startLine,
    bodyEndLine: endLine,
    languageKind,
    startLine,
    endLine
  };
}

function parametersFromSignature(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim().split(/[:=\s]/)[0])
    .filter(Boolean);
}

function isLikelyReactComponent(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function dedupeRoutes(routes: ScannedRoute[]): ScannedRoute[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = `${route.framework}:${route.method ?? ""}:${route.path}:${route.name ?? ""}:${route.filePath}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
