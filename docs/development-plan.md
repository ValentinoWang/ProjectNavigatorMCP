# ProjectNavigatorMCP Development Plan

This document is the milestone plan. For the full Chinese implementation guide, read
`../DEVELOPMENT.zh-CN.md`.

## Product Goal

Build a local Repository Intelligence MCP for coding agents.

The MVP must support:

```text
init -> scan -> map -> capsule -> mcp -> memory
```

## Non-Goals for MVP

Do not build these in the MVP:

- Postgres backend
- web dashboard
- SaaS deployment
- perfect call graph
- full LSP/SCIP integration
- vector database
- autonomous PR workflow

## Target Implementation Stack

- TypeScript / Node.js
- `@modelcontextprotocol/sdk`
- `commander`
- `better-sqlite3`
- `fast-glob`
- `simple-git` or Git child process
- `vitest`

Tree-sitter is a later enhancement unless it can be added without slowing the core loop.

## Planned Repository Layout

```text
ProjectNavigatorMCP/
  package.json
  tsconfig.json
  vitest.config.ts
  AGENTS.md
  README.md
  DEVELOPMENT.zh-CN.md
  src/
    cli/
    db/
    scanner/
    graph/
    capsule/
    memory/
    mcp/
    shared/
  tests/
    fixtures/
      tiny-repo/
  docs/
  examples/
```

## Milestone 1: Project Skeleton

### Tasks

- Create package skeleton.
- Add TypeScript config.
- Add test config.
- Add CLI entry point.
- Implement `pnav doctor`.

### Acceptance

```bash
pnpm install
pnpm test
pnav doctor
```

`pnav doctor` should report Node, Git, package version, and SQLite readiness.

## Milestone 2: SQLite Init

### Tasks

- Implement SQLite connection wrapper.
- Implement migrations.
- Add schema for repos, scan_runs, files, symbols, edges, commands, project_rules,
  memories, and tasks.
- Implement `pnav init <repo>`.

### Acceptance

```bash
pnav init tests/fixtures/tiny-repo
```

Expected result:

```text
tests/fixtures/tiny-repo/.pnav/project.sqlite
tests/fixtures/tiny-repo/.pnav/config.json
```

## Milestone 3: File, Command, and Rule Scan

### Tasks

- Implement file walking with ignore rules.
- Detect languages by extension.
- Parse Makefile, package.json, pubspec.yaml, pyproject.toml where present.
- Parse AGENTS.md, CLAUDE.md, README.md, and docs markdown for project rules.
- Implement `pnav scan <repo>`.
- Implement `pnav map <repo>`.

### Acceptance

```bash
pnav scan tests/fixtures/tiny-repo
pnav map tests/fixtures/tiny-repo
```

Output should include file counts, language counts, important paths, commands, and rules.

## Milestone 4: Symbols and Basic Edges

### Tasks

- Add simplified symbol scanners for Dart, Python, and TypeScript.
- Extract `contains` edges.
- Extract simple `imports` edges.
- Infer `covered_by` edges from test file paths and names.
- Infer `co_changes` edges from Git history.

### Acceptance

`pnav map` should include symbol count and test count.

`find_symbol` service should find fixture repo symbols.

## Milestone 5: Graph Queries and Capsule

### Tasks

- Implement `repo_map` service.
- Implement `find_symbol` service.
- Implement `find_related_files` service.
- Implement `impact_analysis` service.
- Implement `related_tests` service.
- Implement `prepare_task_context` service.
- Implement `pnav capsule <repo> "<task>"`.

### Acceptance

```bash
pnav capsule tests/fixtures/tiny-repo "修复 workspace microplan 页面滚动问题"
```

Output should include likely files, entry points, risks, tests, commands, and project
rules.

## Milestone 6: MCP Server

### Tasks

- Implement `pnav mcp <repo>`.
- Register MCP tools.
- Validate input schemas.
- Return stable JSON outputs.

### MVP Tools

- `repo_map`
- `find_symbol`
- `find_related_files`
- `trace_route`
- `impact_analysis`
- `related_tests`
- `prepare_task_context`
- `search_project_memory`
- `remember_task`

### Acceptance

An MCP client can call:

- `repo_map`
- `find_related_files`
- `prepare_task_context`

without the server crashing or scanning the whole repository per request.

## Milestone 7: Memory Loop

### Tasks

- Implement `remember_task`.
- Implement `search_project_memory`.
- Include memory hits in `prepare_task_context` and `pnav capsule`.

### Acceptance

After storing a task memory, a related future capsule should show the memory hit.

## Milestone 8: Real Target Demo

### Target

```text
/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

### Commands

```bash
pnav init /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
pnav scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
pnav map /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "修复 workspace microplan 页面滚动问题"
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "修改登录身份切换逻辑"
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "调整 session plan 接口字段"
```

### Acceptance

Use `examples/flutter-transfer/demo-queries.md` as the expected result guide.

## Post-MVP Enhancements

Add only after real target demo passes:

1. Tree-sitter parser collectors.
2. LSP/SCIP exact reference support.
3. incremental scan.
4. better scoring and graph traversal.
5. Postgres team memory sync.
6. web dashboard.

## Current Production Gate Contract

v0.8.2 keeps the MVP local-first but hardens Discovery Mode output:

- `authoritativeHandoff.mustRead` remains capped at five primary files.
- `supportingContext` and `suppressedCandidates` expose precise suppression reasons.
- `chainCompleteness` may be `route_test_covered` only when related tests exist for route/page/widget chain files.
- `reuseDecision.affectedCallers` reports symbol-graph caller paths when available.
- Production eval suites can require suppression reasons, maximum mustRead size, and minimum chain completeness.
- Strict eval hard-fails when those required production boundaries are violated.
- Test coverage is strong only when direct/naming test relationships cover chain files; related search remains weak coverage.
- Design-system token/theme tasks keep theme and breakpoint files task-relevant.
