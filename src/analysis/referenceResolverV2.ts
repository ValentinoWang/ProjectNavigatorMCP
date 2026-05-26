export type ReferenceConfidence =
  | "exact_local"
  | "import_alias"
  | "import_resolved"
  | "same_module"
  | "repo_unique_name"
  | "ambiguous_name";

export function confidenceForReference(kind: ReferenceConfidence): number {
  return {
    exact_local: 0.95,
    import_alias: 0.85,
    import_resolved: 0.78,
    same_module: 0.62,
    repo_unique_name: 0.55,
    ambiguous_name: 0.35
  }[kind];
}
