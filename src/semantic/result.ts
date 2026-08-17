import type { SemanticBackendName, SemanticBackendPreference, SemanticProvenance, SemanticResult } from "./types.js";

export const SEMANTIC_AUTHORITY_WARNING =
  "Semantic backend output is supporting evidence only; it cannot determine mustRead, editBoundaryV2, or completion evidence.";

export function semanticResult<T>(
  selectedBackend: SemanticBackendName,
  requestedBackend: SemanticBackendPreference,
  data: T,
  provenance: SemanticProvenance,
  warnings: string[] = [],
  ok = true
): SemanticResult<T> {
  return {
    ok,
    selectedBackend,
    requestedBackend,
    fallback: { used: false, from: null, reason: null },
    data,
    provenance,
    warnings: uniqueWarnings([SEMANTIC_AUTHORITY_WARNING, ...warnings])
  };
}

export function selectSemanticResult<T>(
  result: SemanticResult<T>,
  requestedBackend: SemanticBackendPreference,
  fallback?: { from: SemanticBackendName; reason: string }
): SemanticResult<T> {
  return {
    ...result,
    requestedBackend,
    fallback: fallback
      ? { used: true, from: fallback.from, reason: fallback.reason }
      : { used: false, from: null, reason: null },
    warnings: uniqueWarnings([
      ...result.warnings,
      ...(fallback ? [`Fell back from ${fallback.from}: ${fallback.reason}`] : [])
    ])
  };
}

function uniqueWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings.filter(Boolean)));
}
