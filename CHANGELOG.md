# Changelog

## v0.4.0

Minimal Repair Path & Finish-Time Audit release.

- Added `minimalRepairPath` for short, direct Codex / Claude Code repair paths.
- Added `editBoundaryV2` as the authoritative file boundary with must-edit, may-edit, inspect-only, reference-only, and do-not-touch tiers.
- Added semantic dedupe for repeated guard commands, canonical paths, target files, and validation steps.
- Added Guard Rule subtype matching with token hints, preferred fix patterns, and forbidden patterns.
- Added source document target tiering so inferred body mentions and `depends_on` remain reference-only by default.
- Added domain recipes with aliases, inspect-only paths, and default do-not-touch paths.
- Added SQLite v5 migration for task sessions, task session files, finish audits, and source document evidence tiers.
- Added `audit_task_result` MCP tool, `pnav audit`, and `pnav finish --audit`.
- Added tests for minimal repair paths, edit boundary tiers, semantic dedupe, guard subtype recipes, and finish-time audit.

## v0.3.0

Execution-Ready Project Secretary release.

- Added Guard Rule Registry, default frontend design-system rules, and `explain_guard_rule`.
- Added guard repair recipes with canonical paths, validation commands, and suggested actions.
- Added task-domain inference and domain gates that demote unrelated files and commands.
- Added execution-plan reranking with default 5-8 step task handoff.
- Added worktree boundary output with allowed edit files, risky pre-existing files, and diff verification commands.
- Added source document infer mode for Markdown plans without structured frontmatter.
- Added `record_task_result` MCP tool and `pnav finish` for task-result memory.
- Added SQLite v4 migration for `guard_rules`, `task_runs`, and source document confidence metadata.
- Added tests for guard rules, domain gates, source document inference, and task-result memory.

## v0.2.0

Plan-to-Guard Navigation release.

- Added Markdown source document indexing with frontmatter fields for `owner_domain`, `authority`, `depends_on`, `sync_targets`, and `validation`.
- Added SQLite `documents`, `document_targets`, and `document_steps` tables.
- Added `source_doc`, `guard_output`, `guard_command`, `changed_files`, and `include_dirty_status` support to `prepare_task_context`.
- Added deterministic read order and execution plan output.
- Added guard output parsing for common `file:line` and `file:line:column` logs.
- Added `analyze_source_doc`, `analyze_guard_output`, and `git_worktree_status` MCP tools.
- Added CLI `pnav guard` and `pnav status`.
- Added dirty worktree warnings and edit boundaries.
- Added Prettier format checks to local scripts and CI.
- Added source document, guard output, and worktree status tests.

## v0.1.0

Initial public release.

- Added the `pnav` CLI with `doctor`, `init`, `scan`, `map`, `capsule`, `memory`, `remember`, and `mcp` commands.
- Added a project-local SQLite index at `.pnav/project.sqlite`.
- Added repository scanning for files, commands, rules, symbols, imports, routes, tests, and Git co-change edges.
- Added nine MCP tools for repository maps, symbol search, related files, route tracing, impact analysis, test recommendations, task capsules, and project memory.
- Added a shared MCP response envelope with index status and warnings.
- Added `.pnav/config.json` support for include/exclude rules, domain boosts, source path boosts, max file size, and `.gitignore` handling.
- Added SQLite FTS-backed symbol and memory search.
- Added multi-hop graph traversal for impact analysis.
- Added structured project memory tags, decisions, pitfalls, validation notes, and confidence fields.
- Added tests for migrations, scanning, capsules, MCP tool contracts, config behavior, route parsing, and impact analysis.
- Added GitHub Actions CI for Node 20 and 22.
