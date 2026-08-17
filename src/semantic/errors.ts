export type SemanticBackendErrorCode =
  | "unavailable"
  | "timeout"
  | "output_limit"
  | "invalid_response"
  | "tool_error"
  | "unsupported_version"
  | "not_indexed"
  | "root_mismatch"
  | "artifact_conflict"
  | "worktree_unverifiable"
  | "worktree_modified";

export class SemanticBackendError extends Error {
  constructor(
    public readonly code: SemanticBackendErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "SemanticBackendError";
  }
}

export function semanticErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown semantic backend failure.";
}
