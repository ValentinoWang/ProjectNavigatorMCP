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

For v0.1 through v0.6, these fields should be considered stable:

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

## v0.5 Discovery Fields

`discover_code.data` is the primary Discovery Mode payload:

- `mode`: always `discovery`.
- `entrypoints`: likely routes, pages, handlers, commands, tests, or component entrypoints.
- `coreSymbols`: task-relevant symbols.
- `callGraphPreview`: caller/callee hints with confidence and evidence.
- `reuseCandidates`: existing implementations to inspect before writing new code.
- `duplicateRisks`: similar implementations that may indicate redundant code.
- `impactPreview`: relevant files for first-pass impact review.
- `recommendedReadOrder`: compact file order for agent reading.
- `whyRelated`: evidence chains explaining why files are related.
- `relatedTests`: recommended test files, primary commands, and optional `fallbackCommands`.

`prepare_task_context.data.mode` is `discovery` or `repair`.
When `mode` is `discovery`, `prepare_task_context.data.discovery` contains the same shape as `discover_code.data`.

Call graph tools return confidence-scored edges. Low-confidence ambiguous results must not be treated as exact references.

## v0.6 Discovery Chain Fields

`trace_feature.data` returns:

- `task`
- `chains[]`
- `chains[].entrypoint`
- `chains[].path[]` with `type`, `target`, `why`, and `evidence`
- `chains[].confidence`
- `warnings`

`impact_analysis_v2.data` now includes layered fields:

- `directCallers`
- `directCallees`
- `entrypointImpact`
- `testImpact`
- `reuseImpact`
- `cochangeImpact`
- `riskSummary`

`pnav scan --incremental` returns `incremental` stats in the scan result, including changed,
skipped, deleted, duration, `changedPaths`, `deletedPaths`, `changeKind`, `changePlanes`,
`changePlaneCounts`, `actions`, `stages`, `codeGraphStale`, `codeGraphStaleReason`,
`partialGraphUpdate`, `partialGraphVersion`, `changedCodeFiles`, `deletedCodeFiles`,
`invalidatedFiles`, `reindexedFiles`, `staleEdges`, `fallbackReason`,
`affectedCallerExpansion`, `freshness`, and whether a conservative graph rebuild was used.
Workflow profile, eval-suite, command-source, and docs-only changes can avoid a code graph
rebuild. Mixed metadata changes report `changeKind: "mixed"` and expose each changed plane
separately.

`pnav scan --incremental --metadata-only` refreshes metadata planes and leaves source graph changes
unrebuilt. When source files are dirty in this mode, `codeGraphStale` is true and
`codeGraphStaleReason` explains that the graph rebuild was skipped because metadata-only mode was
requested.

`pnav scan --incremental --verify-partial` adds `partialVerification` when a partial update is
attempted. The verifier output documents allowed differences such as stale co-change evidence and
partial duplicate clusters.

## v0.7 Discovery Quality Fields

`discover_code.data` returns the authoritative Discovery Mode tiers:

- `mustRead`: route, page, module-root, or other high-confidence files the agent should read first.
- `shouldInspect`: useful implementation and support files after `mustRead`.
- `reuseBeforeCreate`: reuse candidates with a non-`create_new_allowed` verdict.
- `ignoreForNow`: demoted files that matched weakly but should not drive first-pass reading.

`entrypoints[]` may include `scoreBreakdown` with deterministic scoring components such as query match, entrypoint type, module proximity, symbol exactness, and domain penalties.

`reuseCandidates[]` may include:

- `verdict`: `reuse_as_is`, `extend_existing`, `extract_shared`, or `create_new_allowed`.
- `suggestion`: a direct coding-agent instruction for avoiding duplicate implementation.
- `scoreBreakdown`: similarity, module proximity, and domain penalty.

`trace_feature.data.chains[]` includes `chainType`:

- `verified_chain`: backed by route/page evidence plus import/test evidence.
- `candidate_chain`: useful but not yet a strict call/import/test chain.

## v0.8 Production Discovery Gate Fields

`discover_code.data.authoritativeHandoff` is the primary production handoff:

- `mode`: `strict_discovery`.
- `confidence`: handoff confidence.
- `chainStatus`: `verified_chain`, `partial_chain`, or `candidate_chain`.
- `chainDepth`: number of route/page/widget steps in `coreChain`.
- `chainCompleteness`: `route_page_only`, `route_main_widget`, `route_section_card`, or `route_test_covered`.
- `testCoverage`: optional coverage evidence with `covered`, `coverageStrength`, `weakCovered`, `testFiles`, and evidence items.
- `mustRead`: the strict primary file list, capped at five by default.
- `coreChain`: route/page/widget chain steps.
- `reuseDecision`: V2 reuse decision with verdict, API fit, missing params, affected callers, and recommended action.
- `impactSummary`: critical tests and files.
- `supportingContext`: useful support dependencies excluded from `mustRead`, optionally with precise `reason` and `reasonDetail`.
- `suppressedCandidates`: files removed from primary context with `reason`, `reasonDetail`, and reason confidence.
- `strictGate`: budget and dropped-file audit.
- `workflowProtocol`: repo-local or built-in workflow guidance for execution. It contains
  `profiles`, `actions`, `recommendedCommands`, `newFileExpectations`, `editPolicies`, and
  `gateSteps`.

Workflow profiles are loaded from the target repo in this order:

1. `.agents/pnav/workflow-profiles.json`
2. `.pnav/workflow-profiles.json`
3. Built-in fallback profiles

Only existing files from a profile can enter `mustRead` or `supportingContext`.
`newFileExpectations` may describe directories, patterns, or future files that do not exist yet.

`production_discovery_eval` expected cases may also include:

- `suppressedWithReasons`: expected suppressed/supporting paths and precise suppression reasons.
- `maxMustRead`: maximum allowed primary context files.
- `minChainCompleteness`: minimum acceptable route-to-widget completeness.
- `supportingContains`, `readOrderContains`, and `orderedBefore` for support context and reading order.
- `warningContains` for required handoff warnings.
- `actionContains`, `recommendedCommandContains`, `newFileExpected`, `readOnlyContains`, and
  `gateStepContains` for workflow protocol assertions.
- `editPolicyContains` for exact workflow edit-policy assertions.
- `fallbackCommandNotContains` to prevent noisy generic commands from becoming fallback suggestions.
- `profileSourcesAny` to require `repo_local` or `built_in` profile provenance.
- `requiresFreshCodeGraph` to make strict metadata-only eval fail when the source graph is stale.

The eval metric `suppressionReasonQuality` defaults to `1` when no suppression reason expectations are provided.

`production_discovery_eval.data` includes `totalLatencyMs`, `slowestStages`, `indexStatus`,
`evalValidity`, and `cacheStats`.
`production_discovery_eval.data.cases[]` includes `latencyBreakdown` and `hardFailures` in strict mode. Strict cases fail when mustRead is missing expected `mustReadAny` paths, contains forbidden paths, exceeds `maxMustRead`, has incomplete suppression reason expectations, falls below `minChainCompleteness`, misses workflow protocol expectations, or violates fallback-command rules.

`pnav eval --metadata-only` runs a metadata-only incremental preflight before the suite. Its
`indexStatus` reports metadata freshness and code graph staleness; stale code graph status is
non-fatal in metadata-only mode unless a case declares `requiresFreshCodeGraph`. In stale
metadata-only runs, `evalValidity.scoreScope` is `metadata_only` and `notValidFor` names graph
uses that still require a fresh symbol/import/route graph.

`trace_feature.data` includes `mode`, `routeToWidgetChainApplicability`, `workflowProtocol`, and
`workflowChain`. In `route` mode, `routeToWidgetChain` returns the route/page/widget chain
independent of wider candidate chains. In `workflow` mode, non-route workflow tasks do not pretend
to have a verified route chain.

When `workflowProtocol.recommendedCommands` is non-empty, generic related-test command matches are
reported under `relatedTests.fallbackCommands` and primary execution should use the workflow
commands.

`impact_analysis_v3.data.impact` adds production impact layers:

- `directConsumers`
- `affectedEntrypoints`
- `affectedRoles`
- `affectedWidgets`
- `affectedViewModels`
- `affectedTests`
- `affectedGuards`
- `reuseClusterImpact`
- `cochangeOnly`
- `riskLevel`
- `why`
