# Roadmap

## v0.1

Stabilize the local Repository Intelligence MCP loop:

- CLI and MCP server.
- Project-local SQLite index.
- File, symbol, import, route, command, rule, test, and Git co-change scanning.
- Unified MCP response envelope.
- Configurable include/exclude and relevance rules.
- FTS-backed search for symbols and project memory.
- Multi-hop impact analysis.
- Flutter target repository validation.

## v0.2

Plan-to-Guard Navigation:

- Markdown frontmatter indexing for source documents.
- `source_doc` support in `prepare_task_context`.
- Deterministic ranking from `sync_targets`, `depends_on`, validation commands, and guard failures.
- Guard output analysis for `file:line` driven repair paths.
- Dirty worktree awareness and edit-boundary warnings.
- Execution plan extraction from Markdown phases, checklists, and validation commands.

## v0.3

Scanner accuracy:

- Richer Dart, TypeScript, JavaScript, and Python symbol extraction.
- Better qualified names and signatures.
- FastAPI router prefix support.
- More import alias resolution.
- Incremental scanning by file hash.

## v0.4

Agent handoff quality:

- Explicit token budgets.
- Stronger impact previews inside task capsules.
- More precise test command ranking.
- Broader fixture coverage for guarded implementation tasks.

## v0.5

Optional language intelligence backends:

- Tree-sitter parser adapters.
- LSP-assisted definition/reference lookup.
- SCIP import support where available.

## v1.0

Make the tool stable for external open-source users:

- Versioned output contracts.
- Backward-compatible migrations.
- Real-world examples across Flutter, Node, Python, and monorepos.
