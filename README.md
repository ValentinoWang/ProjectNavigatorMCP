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

## v0.8 Capabilities

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
19. `minimalRepairPath`: a short 4-7 step repair path for Codex / Claude Code.
20. `editBoundaryV2`: authoritative file tiers for `mustEditFiles`, `mayEditFiles`, `mayInspectFiles`, `referenceOnlyFiles`, and `doNotTouchFiles`.
21. Semantic execution-plan dedupe for repeated guard commands, canonical paths, and validation steps.
22. Guard recipe subtypes with token hints, preferred fix patterns, and forbidden patterns.
23. Source document target tiering so body mentions and `depends_on` stay reference-only by default.
24. Domain recipes with aliases and inspect-only/default-do-not-touch path rules.
25. Finish-time audit through `audit_task_result`, `pnav audit`, and `pnav finish --audit`.
26. Discovery Mode through `discover_code` and `pnav discover`.
27. Symbol Model V2 with qualified names, containers, body ranges, body hashes, and code blocks.
28. Call / Reference Graph V1 through `find_callers`, `find_callees`, and `trace_symbol`.
29. Entrypoint discovery for Flutter routes/pages, FastAPI handlers, commands, tests, and components.
30. Reuse and duplicate detection through `find_similar_code` and `find_reusable_components`.
31. Module maps through `module_map` and `pnav modules`.
32. Evidence explanations through `why_related`.
33. Symbol-aware `impact_analysis_v2`.
34. `trace_feature`: evidence chains from entrypoint to implementation, reuse candidates, and tests.
35. Import Resolution V2 with persisted `import_bindings`.
36. Persisted duplicate clusters and `explain_reuse`.
37. Layered `impact_analysis_v2` output for direct, entrypoint, test, reuse, and co-change impact.
38. Hash-aware `pnav scan --incremental` and explicit `pnav scan --full`.
39. Discovery Quality Hardening: route/page/module-root entrypoints outrank internal card/widget token matches.
40. Discovery tiers: `mustRead`, `shouldInspect`, `reuseBeforeCreate`, and `ignoreForNow`.
41. Verified vs candidate feature chains through `trace_feature`.
42. Explicit reuse verdicts: `reuse_as_is`, `extend_existing`, `extract_shared`, and `create_new_allowed`.
43. Score breakdowns for entrypoint and reuse ranking decisions.
44. `authoritativeHandoff`: strict production discovery handoff with `mustRead`, `coreChain`, `reuseDecision`, `supportingContext`, and `suppressedCandidates`.
45. Route-to-widget chain extraction for Flutter GoRoute/page/widget composition.
46. Strict MustRead Gate: import-only and supporting dependencies are downgraded out of primary context.
47. `impact_analysis_v3` / `pnav impact-v3` with UI composition and critical impact layers.
48. `production_discovery_eval` / `pnav eval` for production-score based discovery evaluation.
49. Precise suppression reasons for production-noise candidates such as l10n, loggers, API error wrappers, screenshots, QA manifests, E2E artifacts, and backend noise in frontend tasks.
50. Truthful `route_test_covered` chain completeness with test coverage evidence.
51. Reuse decisions include affected caller paths when symbol graph evidence is available.
52. Production eval suites can assert `suppressedWithReasons`, `maxMustRead`, and `minChainCompleteness`.
53. Strict production eval reports `hardFailures` and fails on mustRead leaks, missing suppression reasons, budget overruns, or insufficient chain completeness.
54. Route test coverage distinguishes strong direct/naming coverage from weak related-search tests.
55. Design-system token/theme tasks keep theme and breakpoint files task-relevant instead of demoting them as generic support.
56. Repo-local workflow profiles through `.agents/pnav/workflow-profiles.json` or `.pnav/workflow-profiles.json`, with built-in profiles as fallback.
57. `authoritativeHandoff.workflowProtocol` exposes structured actions, commands, new-file expectations, edit policies, gate steps, and profile provenance.
58. Strict production eval can assert workflow protocol fields such as actions, commands, read-only generated output, gate steps, and repo-local profile source.

MCP tools:

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
- `audit_task_result`
- `discover_code`
- `find_entrypoints`
- `find_callers`
- `find_callees`
- `trace_symbol`
- `find_similar_code`
- `find_reusable_components`
- `module_map`
- `why_related`
- `impact_analysis_v2`
- `trace_feature`
- `duplicate_clusters`
- `explain_reuse`

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
- [Minimal Repair Path](docs/minimal-repair-path.md)
- [Edit Boundary V2](docs/edit-boundary-v2.md)
- [Source Document Target Tiering](docs/source-doc-target-tiering.md)
- [Domain Recipes](docs/domain-recipes.md)
- [Discovery Mode](docs/discovery-mode.md)
- [Symbol Model V2](docs/symbol-model-v2.md)
- [Call Graph V1](docs/call-graph-v1.md)
- [Reuse Detection](docs/reuse-detection.md)
- [Module Map](docs/module-map.md)
- [v0.5 Code Discovery & Reuse Plan](docs/v0.5-code-discovery-reuse-plan.md)
- [v0.6 Precise Discovery Chains](docs/v0.6-precise-discovery-chains.md)
- [Discovery Chain](docs/discovery-chain.md)
- [Import Resolution V2](docs/import-resolution-v2.md)
- [Duplicate Clusters](docs/duplicate-clusters.md)
- [Incremental Scan](docs/incremental-scan.md)
- [Finish-Time Audit](docs/finish-time-audit.md)
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
