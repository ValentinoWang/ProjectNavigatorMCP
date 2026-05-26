# ProjectNavigatorMCP

ProjectNavigatorMCP is a local **Repository Intelligence MCP** for Codex, Claude Code,
and other MCP-capable coding agents.

It builds a project-local code map before the agent edits code, then exposes that map
through CLI commands and MCP tools.

## One-Sentence Description

ProjectNavigatorMCP turns a Git repository into an AI-queryable code map and project
memory, so coding agents can locate relevant files, trace relationships, estimate impact,
recommend tests, and reuse prior task knowledge.

## What This Project Is

- A globally installable CLI named `pnav`.
- A local MCP server started by `pnav mcp <repo>`.
- A project-local index stored under `<repo>/.pnav/project.sqlite`.
- A scanner that extracts files, symbols, imports, routes, commands, tests, Git history,
  and project rules.
- A context builder that creates compact handoff packets for Codex / Claude Code.

## What This Project Is Not

- It is not a replacement for Codex or Claude Code.
- It is not the business database of the target project.
- It is not a remote SaaS product in the MVP.
- It should not require Postgres in the MVP.
- It should not attempt perfect whole-program understanding in the first version.

## Storage Decision

Use SQLite in the target repository:

```text
<target-repo>/.pnav/project.sqlite
```

This database stores ProjectNavigatorMCP's own analysis data, not the target project's
business data.

Postgres can be introduced later only if the product needs team-shared memory,
centralized dashboards, permissions, or SaaS-style multi-project management.

## v0.3 Capabilities

The current release supports:

1. `pnav init <repo>`: create `.pnav/` and SQLite database.
2. `pnav scan <repo>`: scan repository files, commands, rules, symbols, and relationships.
3. `pnav map <repo>`: print a compact repository map.
4. `pnav capsule <repo> "<task>"`: produce an agent handoff document.
5. `pnav mcp <repo>`: expose repository intelligence through MCP.
6. `.pnav/config.json`: tune include/exclude rules, domain boosts, source path boosts, and file size limits.
7. MCP response envelopes: every tool returns `repo`, `generated_at`, `index_status`, `data`, and `warnings`.
8. SQLite FTS search for symbols and project memory.
9. Multi-hop impact analysis through graph traversal.
10. Source document parsing for Markdown frontmatter `sync_targets`, `depends_on`, and validation commands.
11. Guard output analysis for `file:line` driven repair paths.
12. Dirty worktree warnings and edit boundaries for safe minimal edits.
13. Guard Rule Registry with deterministic repair recipes and canonical paths.
14. Execution-plan reranking that keeps guarded implementation tasks to the most relevant steps.
15. Domain gates that demote unrelated files and commands, such as backend noise in frontend design-system tasks.
16. Worktree boundary output with allowed edit files, pre-existing dirty files, and diff verification commands.
17. Source document infer mode for useful but non-frontmatter Markdown plans.
18. `record_task_result` / `pnav finish` for automatic task-result memory.

MVP MCP tools:

- `repo_map`
- `find_symbol`
- `find_related_files`
- `trace_route`
- `impact_analysis`
- `related_tests`
- `prepare_task_context`
- `search_project_memory`
- `remember_task`
- `analyze_source_doc`
- `analyze_guard_output`
- `explain_guard_rule`
- `git_worktree_status`
- `record_task_result`

## Example Target Repository

The first example target is:

```text
/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

Its project-local index should live at:

```text
/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.pnav/project.sqlite
```

The hard-coded path above is only an example. The implementation must accept any local
Git repository path.

## Documentation

Start here:

- [中文开发文档](DEVELOPMENT.zh-CN.md)
- [Documentation Change Guide](docs/documentation-change-guide.zh-CN.md)
- [Development Plan](docs/development-plan.md)
- [Architecture](docs/architecture.md)
- [MCP Tools](docs/mcp-tools.md)
- [Configuration](docs/config.md)
- [Output Contract](docs/output-contract.md)
- [Source Documents](docs/source-docs.md)
- [Guard Output Analysis](docs/guard-output.md)
- [Guard Rule Registry](docs/guard-rule-registry.md)
- [Domain Gating](docs/domain-gating.md)
- [Worktree Boundary](docs/worktree-boundary.md)
- [v0.3 Execution Ready Plan](docs/v0.3-execution-ready-plan.md)
- [Roadmap](docs/roadmap.md)
- [flutter-transfer Demo Queries](examples/flutter-transfer/demo-queries.md)
- [Codex MCP Config Example](examples/codex-mcp-config.md)
- [Claude Code MCP Config Example](examples/claude-code-config.md)

## Quick Start

```bash
npm install
npm run build
npm link

pnav doctor
pnav init /path/to/project
pnav scan /path/to/project
pnav map /path/to/project
pnav capsule /path/to/project "fix login flow"
pnav mcp /path/to/project
```

For the Flutter validation project used during development:

```bash
pnav scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "修复 microplan 页面滚动问题"
```

## Suggested Implementation Stack

For the first implementation:

- TypeScript / Node.js for CLI and MCP server.
- `@modelcontextprotocol/sdk` for MCP.
- `commander` for CLI commands.
- `better-sqlite3` for local SQLite access.
- `fast-glob` plus ignore rules for file walking.
- `simple-git` or child-process Git commands for Git metadata.
- lightweight regex/path scanners first.
- Tree-sitter after the file/index/database/MCP loop works.

## Implementation Principle

Build the loop before building perfect intelligence:

```text
init -> scan -> store -> query -> MCP -> capsule -> memory
```

A simple but complete loop is more valuable than a sophisticated parser that is not yet
usable by Codex or Claude Code.
