import { BuiltinSemanticBackend } from "./builtinBackend.js";
import { CbmSemanticBackend } from "./cbmBackend.js";
import { SemanticBackendError, semanticErrorMessage } from "./errors.js";
import { selectSemanticResult } from "./result.js";
import type {
  SemanticArchitectureData,
  SemanticBackendOptions,
  SemanticBackendStatus,
  SemanticChangeData,
  SemanticIndexData,
  SemanticResult,
  SemanticSearchData,
  SemanticTraceData
} from "./types.js";

export class SemanticBackendRouter {
  private readonly preference;
  private readonly cbm;
  private readonly builtin;

  constructor(options: SemanticBackendOptions = {}) {
    this.preference = options.preference ?? "auto";
    this.cbm = new CbmSemanticBackend(options);
    this.builtin = new BuiltinSemanticBackend();
  }

  async status(repoPath: string): Promise<SemanticResult<SemanticBackendStatus>> {
    if (this.preference === "cbm") {
      return selectSemanticResult(await this.cbm.status(repoPath), "cbm");
    }
    if (this.preference === "builtin") {
      return selectSemanticResult(await this.builtin.status(repoPath), "builtin");
    }
    const cbm = await this.cbm.status(repoPath);
    if (cbm.ok && cbm.data.available && cbm.data.indexed) {
      return selectSemanticResult(cbm, "auto");
    }
    const reason = cbm.data.reason ?? `CBM status is ${cbm.data.status}.`;
    return selectSemanticResult(await this.builtin.status(repoPath), "auto", {
      from: "codebase-memory",
      reason
    });
  }

  async index(repoPath: string): Promise<SemanticResult<SemanticIndexData>> {
    if (this.preference === "cbm") {
      return selectSemanticResult(await this.cbm.index(repoPath), "cbm");
    }
    if (this.preference === "builtin") {
      return selectSemanticResult(await this.builtin.index(repoPath), "builtin");
    }
    try {
      return selectSemanticResult(await this.cbm.index(repoPath), "auto");
    } catch (error) {
      if (isIndexSafetyError(error)) {
        throw error;
      }
      return selectSemanticResult(await this.builtin.index(repoPath), "auto", {
        from: "codebase-memory",
        reason: semanticErrorMessage(error)
      });
    }
  }

  async search(repoPath: string, query: string, limit: number): Promise<SemanticResult<SemanticSearchData>> {
    return await this.query(
      repoPath,
      () => this.cbm.search(repoPath, query, limit),
      () => this.builtin.search(repoPath, query, limit)
    );
  }

  async trace(
    repoPath: string,
    query: string,
    direction: "inbound" | "outbound" | "both",
    depth: number,
    limit: number
  ): Promise<SemanticResult<SemanticTraceData>> {
    return await this.query(
      repoPath,
      () => this.cbm.trace(repoPath, query, direction, depth, limit),
      () => this.builtin.trace(repoPath, query, direction, depth, limit)
    );
  }

  async architecture(repoPath: string, scope?: string): Promise<SemanticResult<SemanticArchitectureData>> {
    return await this.query(
      repoPath,
      () => this.cbm.architecture(repoPath, scope),
      () => this.builtin.architecture(repoPath, scope)
    );
  }

  async detectChanges(repoPath: string, baseBranch?: string): Promise<SemanticResult<SemanticChangeData>> {
    return await this.query(
      repoPath,
      () => this.cbm.detectChanges(repoPath, baseBranch),
      () => this.builtin.detectChanges(repoPath, baseBranch)
    );
  }

  private async query<T>(
    repoPath: string,
    cbmCall: () => Promise<SemanticResult<T>>,
    builtinCall: () => Promise<SemanticResult<T>>
  ): Promise<SemanticResult<T>> {
    if (this.preference === "cbm") {
      return selectSemanticResult(await cbmCall(), "cbm");
    }
    if (this.preference === "builtin") {
      return selectSemanticResult(await builtinCall(), "builtin");
    }
    try {
      return selectSemanticResult(await cbmCall(), "auto");
    } catch (error) {
      return selectSemanticResult(await builtinCall(), "auto", {
        from: "codebase-memory",
        reason: semanticErrorMessage(error)
      });
    }
  }
}

function isIndexSafetyError(error: unknown): boolean {
  return (
    error instanceof SemanticBackendError &&
    ["artifact_conflict", "worktree_unverifiable", "worktree_modified"].includes(error.code)
  );
}
