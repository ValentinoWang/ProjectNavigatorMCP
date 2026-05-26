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

For v0.1 and v0.2, these fields should be considered stable:

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
