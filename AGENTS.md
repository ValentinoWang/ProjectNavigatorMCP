# AGENTS.md

This file gives coding agents instructions for working on ProjectNavigatorMCP.

## Product Intent

ProjectNavigatorMCP is a local Repository Intelligence MCP for coding agents. It scans a
Git repository, stores a project-local code map in `.pnav/project.sqlite`, and exposes
navigation, impact analysis, test recommendation, and project memory through CLI and MCP
tools.

## Implementation Priorities

1. Keep the MVP local-first.
2. Use SQLite for the MVP; do not introduce Postgres unless a later task explicitly asks.
3. Build an end-to-end loop before adding complex parsing.
4. Prefer deterministic, inspectable behavior over hidden LLM calls.
5. Do not hard-code the example `flutter-transfer` path in implementation logic.
6. Treat Tree-sitter, LSP, SCIP, embeddings, and Postgres as later enhancements.

## Required CLI Shape

Implement these commands first:

```bash
pnav doctor
pnav init <repo>
pnav scan <repo>
pnav map <repo>
pnav capsule <repo> "<task>"
pnav mcp <repo>
```

## Required Storage Shape

The target repository should contain:

```text
<repo>/.pnav/
  project.sqlite
  config.json
  cache/
```

Do not store analysis data in the target project's business database.

## Code Organization

Preferred source layout:

```text
src/
  cli/
  mcp/
  db/
  scanner/
  graph/
  capsule/
  memory/
```

Keep modules small. CLI handlers should call services; they should not contain scanning or
SQL logic directly.

## MVP Scanner Rule

The first scanner may be imperfect. It must still be useful:

- collect files and languages
- collect important paths
- collect commands from Makefile/package/pubspec/pyproject
- collect simple symbols from Dart/Python/TypeScript via regex or Tree-sitter
- collect imports where easy
- collect Git co-change pairs
- collect AGENTS.md / CLAUDE.md / README rules as project rules

Do not block MVP completion on perfect semantic analysis.

## Testing Expectations

At minimum, add tests for:

- database migrations
- file scanner ignore behavior
- symbol extraction for a small fixture repo
- tool output shape for MCP tools
- `pnav capsule` on a fixture task

## Documentation Expectations

When changing tool names, schema fields, or CLI commands, update all of these together:

- `README.md`
- `DEVELOPMENT.zh-CN.md`
- `docs/development-plan.md`
- `docs/architecture.md`
- `docs/mcp-tools.md`
- `examples/flutter-transfer/demo-queries.md`

## Safety and Repo Hygiene

Do not commit generated databases, caches, `node_modules`, or `.pnav` contents. Keep sample
outputs small and textual.
