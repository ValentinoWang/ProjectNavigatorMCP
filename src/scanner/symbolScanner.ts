import type { ScannedImport, ScannedRoute, ScannedSymbol } from "./types.js";

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

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const classMatch = line.match(
      /^\s*(?:abstract\s+|base\s+|final\s+|sealed\s+)?(?:class|mixin|enum|extension)\s+([A-Za-z_][A-Za-z0-9_]*)/
    );
    if (classMatch) {
      symbols.push(symbol(filePath, classMatch[1], "class", lineNumber, line.trim()));
    }

    const functionMatch = line.match(
      /^\s*(?:[A-Za-z_<>,?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*(?:async\s*)?[{=>]/
    );
    if (functionMatch && !["if", "for", "while", "switch"].includes(functionMatch[1])) {
      symbols.push(symbol(filePath, functionMatch[1], "function", lineNumber, line.trim()));
    }

    const providerMatch = line.match(/\b(?:final|var)\s+([A-Za-z_][A-Za-z0-9_]*Provider)\s*=/);
    if (providerMatch) {
      symbols.push(symbol(filePath, providerMatch[1], "provider", lineNumber, line.trim()));
    }

    const importMatch = line.match(/^\s*import\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      imports.push({ fromPath: filePath, importText: importMatch[1] });
    }

    if (line.includes("GoRoute(") || /name:\s*[A-Za-z0-9_.]+\s*,/.test(line)) {
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

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const classMatch = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (classMatch) {
      symbols.push(symbol(filePath, classMatch[1], "class", lineNumber, line.trim()));
    }

    const defMatch = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (defMatch) {
      symbols.push(symbol(filePath, defMatch[1], "function", lineNumber, line.trim()));
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

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const classMatch = line.match(/^\s*export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)|^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    const className = classMatch?.[1] ?? classMatch?.[2];
    if (className) {
      symbols.push(symbol(filePath, className, "class", lineNumber, line.trim()));
    }

    const functionMatch = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (functionMatch) {
      symbols.push(symbol(filePath, functionMatch[1], "function", lineNumber, line.trim()));
    }

    const constFunctionMatch = line.match(/^\s*(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(/);
    if (constFunctionMatch) {
      symbols.push(symbol(filePath, constFunctionMatch[1], "function", lineNumber, line.trim()));
    }

    const importMatch = line.match(/^\s*import(?:.+from\s+)?["']([^"']+)["']/);
    if (importMatch) {
      imports.push({ fromPath: filePath, importText: importMatch[1] });
    }
  });

  return { symbols, imports, routes };
}

function symbol(filePath: string, name: string, kind: string, line: number, signature: string): ScannedSymbol {
  return {
    filePath,
    name,
    kind,
    signature,
    qualifiedName: name,
    startLine: line,
    endLine: line
  };
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
