# Changelog

## v0.9.0

Fresh Graph Correctness & Equivalence release.

- Added stable graph snapshots for file, symbol, import binding, route, test, code block, symbol-edge, and freshness planes.
- Added partial-vs-full equivalence verification through `pnav verify-equivalence` and `pnav scan --incremental --verify-partial --compare-full`.
- Added fresh graph benchmarking through `pnav benchmark-fresh-graph`.
- Added `EvidenceFreshness` and propagated freshness to symbol graph and impact evidence.
- Added strict eval v2 fields for fresh/equivalent graph checks and stale critical evidence guards.
- Added v0.9 adversarial graph fixture coverage for rename, delete, and route/widget mutation equivalence.
- Moved optional Tree-sitter, LSP, and SCIP backend work to v0.10 in the roadmap.

## v0.8.6

Fresh Graph & Deep Runtime Cache release.

- Added eval `evalValidity` with `scoreScope`, `validFor`, and `notValidFor` so metadata-only stale-graph scores are not mistaken for full fresh-graph validation.
- Added `requiresFreshCodeGraph` strict eval support with the `fresh_code_graph_required_but_stale` hard failure.
- Upgraded file-level incremental scan to partial graph invalidation v2, including deleted source invalidation, affected caller expansion, stable incoming edge rewiring, and batch partial updates up to 100 code graph paths.
- Added scan freshness reporting for file, symbol, import, route, test, duplicate, and co-change graph planes.
- Added `pnav scan --incremental --verify-partial` output metadata for partial update verification.
- Expanded eval runtime `cacheStats` with file, symbol, route, test, command, workflow, related-file, handoff, related-test, and entrypoint cache buckets.

## v0.8.5

Incremental Graph & Eval Runtime Hardening release.

- Added incremental `changePlanes`, action reporting, stale-code-graph status, and partial graph update metadata to scan results.
- Added `pnav scan --incremental --metadata-only` so workflow/eval/command/doc metadata can refresh without forcing a code graph rebuild in dirty worktrees.
- Added file-level graph update v1 for small source changes, with conservative fallback for source deletions and large change sets.
- Added `pnav eval --metadata-only` and `--allow-stale-code-graph`, plus eval `indexStatus` and runtime `cacheStats`.
- Added MCP `production_discovery_eval` support for metadata-only and stale-code-graph eval options.
- Added regression coverage for mixed metadata changes, metadata-only stale graph reporting, partial source updates, conservative fallback, and eval cache hits.

## v0.8.4

Repo-local Workflow Runtime Hardening release.

- Added strict gate support for repo-local workflow profile direct targets so explicit guard, visual, screenshot, manifest, and DTO source files can enter `authoritativeHandoff.mustRead` when they are the real execution path.
- Added `mustReadPolicy` for repo-local workflow seeds so explicit `force` targets override generic noise suppression while still respecting the strict mustRead budget.
- Added workflow-mode `trace-feature` output with `workflowProtocol`, `workflowChain`, and `routeToWidgetChainApplicability` for non-route workflow tasks.
- Added eval timing breakdowns, slowest-stage reporting, workflow edit-policy assertions, and fallback-command assertions.
- Demoted generic `relatedTests.commands` to `fallbackCommands` when workflow `recommendedCommands` are available.
- Added lightweight incremental scan handling for workflow-profile, eval-suite, command-source, and docs-only changes, with CLI progress messages on stderr.
- Kept generic dependency-tier and noisy-path suppression for non-explicit candidates so broad Markdown, generated artifacts, tests, screenshots, and infrastructure still stay out of `mustRead` without evidence.
- Added regression coverage for visual matrix artifacts and cross-stack exercise read DTO tasks.
- Validated the `flutter-transfer` production discovery suite across 12 realistic frontend, backend, contract, database, guard, and E2E scenarios.

## v0.8.3

Strict Eval & Coverage Truthfulness release.

- Added strict eval hard failures for `mustNotRead` leaks, `maxMustRead` budget overruns, missing suppression reasons, and insufficient chain completeness.
- Added `hardFailures` to production eval case results so strict failures are inspectable even when weighted score remains high.
- Tightened `route_test_covered` so only strong direct/naming test relationships trigger it; related-search tests are reported as weak coverage.
- Added `coverageStrength` and `weakCovered` to route-to-widget test coverage metadata.
- Protected design-system token/theme tasks so `experience_theme.dart` and breakpoint/token files are not demoted as generic `theme_token_support`.

## v0.8.2

Production Gate Regression Fix release.

- Added precise suppression reasons for l10n, logger, API error, auth cache, theme token, helper, generated model, E2E, screenshot, QA, backend, and design-system support candidates.
- Implemented truthful `route_test_covered` chain completeness with route-to-widget test coverage metadata.
- Filled `authoritativeHandoff.reuseDecision.affectedCallers` from symbol graph callers and included caller review guidance in reuse actions.
- Extended production eval expectations with `suppressedWithReasons`, `maxMustRead`, and `minChainCompleteness`.
- Added adversarial production-noise fixture tests for mustRead suppression, route test coverage, reuse callers, and strict eval scoring.

## v0.8.1

Production Gate Hardening release.

- Added `chainDepth` and `chainCompleteness` to the authoritative handoff so `verified_chain` no longer hides how far the route/page/widget evidence actually reaches.
- Wired `authoritativeHandoff.reuseDecision` to Reuse Decision Engine V2 with API-fit, missing-params, and recommended-action output.
- Hardened historical SQLite migrations so replayed v2/v4/v5/v6/v7 column additions skip existing columns instead of failing with duplicate-column errors.
- Added legacy schema replay tests for v1, v3, and v6 databases.

## v0.8.0

Production Discovery Gate release.

- Added `authoritativeHandoff` for strict Discovery Mode handoff.
- Added route-to-widget chain extraction for Flutter route/page/widget composition.
- Added Strict MustRead Gate with `supportingContext`, `suppressedCandidates`, and `strictGate`.
- Added implementation dependency tiering so import-only support files do not enter primary context.
- Added Reuse Decision Engine V2 with component API fit checks.
- Added structural fingerprints for code blocks and SQLite schema v8 tables.
- Added `impact_analysis_v3` and `pnav impact-v3`.
- Added production discovery eval harness with `production_discovery_eval` and `pnav eval`.

## v0.7.0

Discovery Quality Hardening release.

- Reworked Discovery Mode ranking so route, page, and module-root entrypoints outrank internal card/widget token matches.
- Added score breakdowns for entrypoints and reuse candidates.
- Added `mustRead`, `shouldInspect`, `reuseBeforeCreate`, and `ignoreForNow` discovery tiers.
- Added verified vs candidate feature-chain classification.
- Added stronger Discovery Mode domain gating for Flutter/frontend UI tasks.
- Added explicit reuse verdicts: `reuse_as_is`, `extend_existing`, `extract_shared`, and `create_new_allowed`.
- Strengthened near-duplicate risk thresholds for reuse discovery.
- Fixed v7 SQLite migration idempotence when `files.last_scanned_at` or `files.deleted_at` already exists.
- Added migration and discovery-quality regression tests.

## v0.6.0

Precise Discovery Chains & Incremental Index release.

- Added `trace_feature` MCP tool and `pnav trace-feature`.
- Added Import Resolution V2 with persisted `import_bindings`.
- Added duplicate cluster persistence plus `duplicate_clusters` and `explain_reuse`.
- Added layered `impact_analysis_v2` output for direct callers/callees, entrypoints, tests, reuse risks, co-change neighbors, and risk summaries.
- Added `pnav scan --incremental` and `pnav scan --full`.
- Added SQLite v7 migration for `import_bindings`, `discovery_chains`, and file scan metadata.
- Added tests for feature tracing, import resolution, duplicate clusters, impact layering, and incremental scan.

## v0.5.0

Code Discovery & Reuse Intelligence release.

- Added Discovery Mode with `discover_code` and `pnav discover`.
- Added Symbol Model V2 fields and `code_blocks`.
- Added Call / Reference Graph V1 with `symbol_edges`, confidence, and evidence.
- Added `find_entrypoints`, `find_callers`, `find_callees`, and `trace_symbol`.
- Added deterministic reuse and duplicate detection with `find_similar_code` and `find_reusable_components`.
- Added module maps through `module_map` and `pnav modules`.
- Added `why_related` evidence chains.
- Added symbol-aware `impact_analysis_v2`.
- Added SQLite v6 migration for `code_blocks`, `symbol_edges`, similarity tables, modules, and enriched symbol metadata.
- Added v0.5 discovery fixture and tests for discovery mode, symbol model v2, call graph, reuse detection, and module maps.

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
