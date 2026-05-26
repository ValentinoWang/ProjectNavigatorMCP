# Output Contract

ProjectNavigatorMCP has two public output surfaces:

- CLI commands for humans and local scripts.
- MCP tools for Codex, Claude Code, and other MCP clients.

## MCP Envelope

Every MCP tool returns this JSON envelope:

```json
{
  "repo": "repo-name",
  "generated_at": "2026-05-26T00:00:00.000Z",
  "index_status": {
    "scanned": true,
    "git_sha": "indexed-git-sha",
    "current_git_sha": "current-git-sha",
    "stale": false
  },
  "data": {},
  "warnings": []
}
```

`data` is tool-specific. `warnings` contains non-fatal issues, such as missing index data.

## Naming

The current TypeScript service layer uses camelCase fields. MCP output preserves the service layer shape inside `data`, while the shared envelope uses snake_case for protocol-level fields.

## Stability

For v0.1 through v0.4, these fields should be considered stable:

- `repo`
- `generated_at`
- `index_status.scanned`
- `index_status.git_sha`
- `index_status.current_git_sha`
- `index_status.stale`
- `data`
- `warnings`

Tool-specific result shapes may still evolve before v1.0, but changes should be documented in `docs/mcp-tools.md` and covered by tests.

## v0.2 Task Context Fields

`prepare_task_context.data` may include these plan-to-guard fields:

- `sourceDoc`: parsed Markdown frontmatter, targets, and execution steps.
- `guardFindings`: parsed guard output findings.
- `readOrder`: ranked file reading order using deterministic signals first.
- `executionPlan`: ordered commands and source document steps.
- `editBoundary`: preferred files and dirty files that should not be touched without reason.
- `dirtyWorktree`: Git working tree status when requested.
- `warnings`: task-level warnings.

Dirty worktree data is intentionally not part of `index_status`. It describes the Git working tree, not the stored repository index.

## v0.3 Task Context Fields

`prepare_task_context.data` may also include these execution-ready fields:

- `domain`: inferred or hinted task domain.
- `guardRecipes`: matched guard rule recipes, canonical paths, and validation commands.
- `executionPlan[].score`: reranked execution relevance.
- `executionPlan[].penalties`: reasons a step was penalized.
- `worktreeBoundary`: allowed edit files, risky pre-existing dirty files, and diff verification commands.
- `debug.demotedFiles`: files demoted by domain gates.
- `debug.droppedCommands`: commands dropped or penalized by the execution-plan reranker.

## v0.4 Task Context Fields

`prepare_task_context.data` now exposes one authoritative navigation path for new agents:

- `minimalRepairPath`: the preferred 4-7 step repair path. Agents should read this before broader `executionPlan`.
- `editBoundaryV2`: the authoritative edit boundary. `mustEditFiles` and `mayEditFiles` are editable; `mayInspectFiles`, `referenceOnlyFiles`, and `doNotTouchFiles` are not editable by default.
- `coreReadOrder`: files to inspect for the current repair.
- `referenceReadOrder`: supporting files and documents that should not become edit targets by default.
- `readOrder[].contextTier`: `core`, `inspect`, `reference`, or `suppressed`.
- `readOrder[].editTier`: `must_edit`, `may_edit`, `may_inspect`, `reference_only`, or `do_not_touch`.
- `readOrder[].evidenceTier`: deterministic evidence such as `direct_guard`, `frontmatter_sync`, or `body_path_mention`.
- `guardRecipes[].subtype`, `tokenHints`, `preferredFixPatterns`, and `forbiddenPatterns`.
- `taskSessionId`: the session identifier used by finish-time audit.
- `debug.dedupedPlanItems` and `debug.suppressedCandidates` for ranking diagnostics.

`worktreeBoundary.allowedEditFiles` is derived from `editBoundaryV2.mustEditFiles + editBoundaryV2.mayEditFiles`.
New integrations should treat `editBoundaryV2` as the single source of truth.

## v0.4 Finish Audit

`audit_task_result.data.audit` reports whether the final diff stayed inside `editBoundaryV2`, whether inspect-only or do-not-touch files were modified, whether guard scripts or snapshots were changed, and whether required validation commands were marked passed.
