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

Execution-Ready Project Secretary:

- Guard Rule Registry with repair recipes, canonical paths, and validation commands.
- Execution-plan reranking for low-noise 5-8 step handoffs.
- Domain gates that demote unrelated files and commands without hiding explicit evidence.
- Worktree boundary output for safe minimal edits in dirty repositories.
- Source document infer mode for non-frontmatter Markdown plans.
- Automatic task-result memory through `record_task_result` and `pnav finish`.

## v0.4

Minimal Repair Path & Finish-Time Audit:

- `minimalRepairPath` as the primary short execution path for coding agents.
- `editBoundaryV2` with must-edit, may-edit, inspect-only, reference-only, and do-not-touch tiers.
- Semantic dedupe for repeated guard commands, canonical paths, and validation steps.
- Guard recipe subtypes with token hints, preferred fix patterns, and forbidden patterns.
- Source document target tiering so inferred body mentions do not become editable boundaries.
- Domain recipes with aliases, inspect-only paths, and default do-not-touch paths.
- Finish-time audit with `audit_task_result`, `pnav audit`, and `pnav finish --audit`.

## v0.5

Code Discovery & Reuse Intelligence:

- Discovery Mode with `discover_code` and `pnav discover`.
- Symbol Model V2 with body ranges, code blocks, and fingerprints.
- Call / Reference Graph V1 with confidence and evidence.
- Entrypoint discovery for Flutter, FastAPI, commands, tests, and components.
- Reuse and duplicate detection without a vector database.
- Module maps.
- `why_related` evidence chains.
- Symbol-aware `impact_analysis_v2`.

## v0.6

Precise Discovery Chains & Incremental Index:

- Incremental scanning by file hash.
- Import Resolution V2 with persisted bindings.
- Feature chains from entrypoint to implementation, reuse candidate, and test.
- Duplicate cluster persistence and reuse explanations.
- Layered impact analysis.
- Evidence-chain ranking improvements.

## v0.7

Discovery Quality Hardening:

- Route/page/module-root entrypoints outrank internal token-heavy widgets.
- Discovery results are split into `mustRead`, `shouldInspect`, `reuseBeforeCreate`, and `ignoreForNow`.
- Feature chains are classified as `verified_chain` or `candidate_chain`.
- Reuse candidates return explicit verdicts: reuse, extend, extract, or create new.
- Flutter/frontend UI tasks strongly demote backend/database/infra noise.
- Score breakdowns explain entrypoint and reuse ranking decisions.

## v0.8

Production Discovery Gate:

- `authoritativeHandoff` as the primary strict handoff for coding agents.
- Flutter route-to-widget chain extraction.
- Implementation edge tiering: core implementation, supporting dependency, framework dependency, irrelevant import.
- Strict MustRead Gate with max 5 primary files and suppression explanations.
- Reuse Decision Engine V2 with component API fit.
- Structural Fingerprint V2 for widget/service shape.
- `impact_analysis_v3`.
- `pnav eval` production discovery harness.

## v0.8.1

Production Gate Hardening:

- `chainDepth` and `chainCompleteness` clarify whether the handoff reached route/page, main widget, section/card, or test-covered depth.
- `authoritativeHandoff.reuseDecision` uses Reuse Decision Engine V2 with API-fit and recommended-action output.
- Historical migrations are idempotent when old SQLite databases already contain added columns.

## v0.8.2

Production Gate Regression Fix:

- Precise suppression reasons for support dependencies, generated files, artifacts, and domain noise.
- Truthful `route_test_covered` output with `testCoverage` metadata.
- `reuseDecision.affectedCallers` populated from symbol graph caller paths.
- Strict eval expectations for suppression reasons, mustRead budget, and minimum chain completeness.

## v0.9

Scanner accuracy and optional language intelligence backends:

- Richer import alias resolution.
- Tree-sitter parser adapters.
- LSP-assisted definition/reference lookup.
- SCIP import support where available.

## v1.0

Make the tool stable for external open-source users:

- Versioned output contracts.
- Backward-compatible migrations.
- Real-world examples across Flutter, Node, Python, and monorepos.
