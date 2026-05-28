# MCP Tools

ProjectNavigatorMCP exposes repository intelligence to Codex, Claude Code, and other MCP clients.

Server command:

```bash
pnav mcp <repo>
```

Example:

```bash
pnav mcp /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

The MCP server reads the project-local index:

```text
<repo>/.pnav/project.sqlite
```

## Shared Envelope

All MCP tools return a JSON string inside MCP text content. The JSON always uses this envelope:

```json
{
  "repo": "flutter-transfer",
  "generated_at": "2026-05-26T00:00:00.000Z",
  "index_status": {
    "scanned": true,
    "git_sha": "abc123",
    "current_git_sha": "abc123",
    "stale": false
  },
  "data": {},
  "warnings": []
}
```

`index_status.scanned` is false when the repository has not been scanned yet. `stale` is true when the latest stored scan SHA differs from the current Git SHA.

Scores are relevance values. Confidence describes relationship reliability.

## Deterministic Ranking

v0.4 uses deterministic navigation signals before broad keyword matching:

1. Guard output `file:line`.
2. Guard Rule Registry canonical paths, recipe subtypes, and repair recipes.
3. `source_doc` frontmatter `sync_targets`.
4. `source_doc` validation command targets.
5. `source_doc` `depends_on`.
6. Domain gates for positive/negative paths and commands.
7. Symbol and path token matches.
8. Generic Markdown matches.

## Tools

### `repo_map`

Input:

```json
{}
```

Data shape:

```json
{
  "repo": "flutter-transfer",
  "rootPath": "/path/to/flutter-transfer",
  "gitSha": "abc123",
  "languages": [{ "language": "dart", "files": 2512 }],
  "counts": {
    "files": 5523,
    "symbols": 34985,
    "routes": 495,
    "tests": 810,
    "commands": 104,
    "rules": 300,
    "memories": 2
  },
  "importantPaths": ["AGENTS.md", "README.md", "Makefile"],
  "commands": [{ "name": "test", "command": "make test", "sourceFile": "Makefile", "category": "test" }],
  "recentScanStatus": "completed"
}
```

### `find_symbol`

Input:

```json
{ "query": "IdentityController", "limit": 10 }
```

Data shape:

```json
{
  "matches": [
    {
      "name": "IdentityController",
      "kind": "class",
      "signature": "class IdentityController",
      "qualifiedName": "IdentityController",
      "path": "lib/core/identity/identity_controller.dart",
      "startLine": 12,
      "endLine": 12,
      "score": 0.92
    }
  ]
}
```

### `find_related_files`

Input:

```json
{ "task": "修复 microplan 页面滚动问题", "limit": 20 }
```

Data shape:

```json
{
  "files": [
    {
      "path": "lib/modules/workspace/pages/microplan_page.dart",
      "language": "dart",
      "score": 0.88,
      "reason": "Path, symbols, or configured domains match the task."
    }
  ]
}
```

### `trace_route`

Input:

```json
{ "query": "workspaceMicroplan", "limit": 20 }
```

Data shape:

```json
{
  "routes": [
    {
      "framework": "flutter_go_router",
      "method": null,
      "path": "/workspace/microplan",
      "name": "workspaceMicroplan",
      "routeFile": "lib/core/router/app_router.dart",
      "targetSymbol": "workspaceMicroplan"
    }
  ]
}
```

### `impact_analysis`

Input:

```json
{ "target": "lib/core/identity/identity_controller.dart", "depth": 2, "direction": "both" }
```

`direction` can be `upstream`, `downstream`, or `both`.

Data shape:

```json
{
  "target": "lib/core/identity/identity_controller.dart",
  "impactedFiles": [
    {
      "path": "test/core/identity/identity_controller_test.dart",
      "relationship": "covered_by",
      "distance": 1,
      "score": 0.9,
      "confidence": 0.9,
      "pathChain": [
        "lib/core/identity/identity_controller.dart --covered_by--> test/core/identity/identity_controller_test.dart"
      ]
    }
  ],
  "risks": ["Review direct imports, related tests, and Git co-change neighbors before editing."]
}
```

### `related_tests`

Input:

```json
{ "changedFiles": ["lib/core/identity/identity_controller.dart"], "task": "fix identity login" }
```

Data shape:

```json
{
  "commands": [
    { "name": "test", "command": "make test", "sourceFile": "Makefile", "category": "test", "confidence": 0.86 }
  ],
  "testFiles": ["test/core/identity/identity_controller_test.dart"]
}
```

### `prepare_task_context`

Input:

```json
{
  "task": "修复 microplan 页面滚动问题",
  "source_doc": "develop/前端/角色视觉设计系统一致性治理完整方案.md",
  "guard_output": "frontend/lib/page.dart:9\\nRaw breakpoint is not allowed.",
  "guard_command": "bash scripts/quality/run_frontend_design_system_usage_guard.sh --mode ci",
  "changed_files": ["frontend/lib/page.dart"],
  "maxFiles": 20,
  "maxSymbols": 12,
  "includeMemory": true,
  "includeRules": true,
  "include_dirty_status": true,
  "domain_hint": "frontend_design_system",
  "plan_max_steps": 8,
  "include_debug": true
}
```

Data shape:

```json
{
  "task": "修复 microplan 页面滚动问题",
  "domain": { "name": "frontend_design_system", "confidence": 0.93, "evidence": [] },
  "sourceDoc": {
    "path": "develop/前端/角色视觉设计系统一致性治理完整方案.md",
    "ownerDomain": "frontend_visual_system",
    "authority": "design_governance",
    "syncTargets": ["scripts/quality/check_role_visual_system_guard.py"]
  },
  "guardFindings": [
    {
      "file": "frontend/lib/page.dart",
      "line": 9,
      "ruleId": "DS-BREAKPOINT",
      "domain": "frontend_design_system",
      "message": "Raw breakpoint is not allowed."
    }
  ],
  "guardRecipes": [{ "ruleId": "DS-BREAKPOINT", "canonicalPaths": [], "validationCommands": [] }],
  "minimalRepairPath": {
    "confidence": 0.92,
    "steps": [
      {
        "order": 1,
        "action": "open",
        "target": "frontend/lib/page.dart:9",
        "tier": "must_edit",
        "why": "Direct guard failure location."
      }
    ],
    "warnings": []
  },
  "editBoundaryV2": {
    "mustEditFiles": ["frontend/lib/page.dart"],
    "mayEditFiles": [],
    "mayInspectFiles": ["frontend/lib/modules/design_system/theme/experience_theme.dart"],
    "referenceOnlyFiles": [],
    "doNotTouchFiles": ["backend/**", "database/**"],
    "warnings": []
  },
  "coreReadOrder": [
    {
      "path": "frontend/lib/page.dart",
      "why": "Guard failure location",
      "score": 1,
      "contextTier": "core",
      "editTier": "must_edit",
      "evidenceTier": "direct_guard"
    }
  ],
  "referenceReadOrder": [],
  "executionPlan": [
    {
      "order": 1,
      "title": "Fix frontend/lib/page.dart:9",
      "command": "bash scripts/quality/run_frontend_design_system_usage_guard.sh --mode ci",
      "score": 1,
      "penalties": []
    }
  ],
  "worktreeBoundary": {
    "allowedEditFiles": ["frontend/lib/page.dart"],
    "preExistingDirtyFiles": [],
    "riskyDirtyFiles": [],
    "verifyDiffCommands": ["git diff -- frontend/lib/page.dart", "git status --short"]
  },
  "dirtyWorktree": { "dirty": true, "summary": { "modifiedCount": 42, "stagedCount": 0, "untrackedCount": 3 } },
  "relatedFiles": [],
  "symbols": [],
  "routes": [],
  "relatedTests": { "commands": [], "testFiles": [] },
  "projectRules": [],
  "memoryHits": [],
  "taskSessionId": "tsk_20260526_000000_abc123",
  "debug": { "demotedFiles": [], "droppedCommands": [], "dedupedPlanItems": [], "suppressedCandidates": [] },
  "nextSteps": []
}
```

`minimalRepairPath`, `editBoundaryV2`, `coreReadOrder`, and `referenceReadOrder` are the v0.4 navigation facts new agents should use. `worktreeBoundary.allowedEditFiles` is derived from `editBoundaryV2.mustEditFiles + editBoundaryV2.mayEditFiles`.

### `analyze_source_doc`

Input:

```json
{ "source_doc": "docs/plans/role_visual_system.md" }
```

Data shape:

```json
{
  "doc": {
    "path": "docs/plans/role_visual_system.md",
    "ownerDomain": "design_system",
    "authority": "canonical",
    "syncTargets": ["scripts/quality/check_role_visual_system_guard.py"],
    "targets": [],
    "steps": []
  }
}
```

### `analyze_guard_output`

Input:

```json
{
  "output": "frontend/lib/page.dart:9\\nPrivate role palette usage is not allowed.",
  "command": "python scripts/quality/check_role_visual_system_guard.py",
  "source_doc": "docs/plans/role_visual_system.md"
}
```

Data shape:

```json
{
  "findings": [{ "file": "frontend/lib/page.dart", "line": 9, "rule": "role_visual_system" }],
  "likelyFixFiles": [{ "path": "frontend/lib/page.dart", "why": "Direct guard failure location", "score": 1 }],
  "suggestedActions": [],
  "validationCommands": ["python scripts/quality/check_role_visual_system_guard.py"],
  "warnings": []
}
```

### `git_worktree_status`

Input:

```json
{}
```

Data shape:

```json
{
  "dirty": true,
  "modified": ["frontend/lib/page.dart"],
  "staged": [],
  "untracked": [],
  "summary": { "modifiedCount": 1, "stagedCount": 0, "untrackedCount": 0 },
  "warnings": [
    "Worktree has existing changes. Treat them as pre-existing context unless they are explicitly in this task boundary."
  ]
}
```

### `explain_guard_rule`

Input:

```json
{
  "rule": "DS-BREAKPOINT",
  "command": "bash scripts/quality/run_frontend_design_system_usage_guard.sh --mode ci",
  "output": "frontend/lib/page.dart:9 [DS-BREAKPOINT] raw width"
}
```

Data shape:

```json
{
  "ruleId": "DS-BREAKPOINT",
  "subtype": "breakpoint",
  "domain": "frontend_design_system",
  "canonicalPaths": ["frontend/lib/modules/design_system/theme/experience_theme.dart"],
  "recipe": { "title": "Replace raw breakpoint or magic width with design-system breakpoint token" },
  "validationCommands": ["python scripts/quality/check_role_visual_system_guard.py"],
  "tokenHints": ["DSBreakpoints", "ExperienceBreakpoints", "experienceTheme.breakpoints"],
  "preferredFixPatterns": ["Use existing design-system breakpoint token/API."],
  "forbiddenPatterns": ["Do not add per-widget private breakpoint constants."],
  "confidence": 0.91
}
```

### `search_project_memory`

Input:

```json
{ "query": "identity token refresh", "limit": 10 }
```

Data shape:

```json
{
  "memories": [
    {
      "id": 12,
      "topic": "Fix identity token refresh",
      "summary": "Token refresh failed because...",
      "files": [],
      "commands": [],
      "tags": ["identity", "token"],
      "memoryType": "task",
      "confidence": 1,
      "score": 0.91,
      "createdAt": "2026-05-26 00:00:00"
    }
  ]
}
```

### `remember_task`

Input:

```json
{
  "title": "Fix identity token refresh",
  "summary": "Token refresh failed because...",
  "changedFiles": ["lib/core/identity/identity_controller.dart"],
  "tests": ["flutter test test/core/identity/identity_controller_test.dart"],
  "tags": ["identity", "token"],
  "decisions": ["Keep refresh handling inside identity controller."],
  "pitfalls": ["Do not skip role-specific workspace checks."],
  "validation": ["flutter test passed"]
}
```

### `record_task_result`

Input:

```json
{
  "title": "Fix DS breakpoint",
  "task": "角色视觉设计系统一致性治理",
  "guard_output": "frontend/lib/page.dart:9 [DS-BREAKPOINT] raw width",
  "guard_command": "bash scripts/quality/run_frontend_design_system_usage_guard.sh --mode ci",
  "validation": ["make frontend-design-system-usage-guard"],
  "result": "passed"
}
```

Data shape:

```json
{
  "stored": true,
  "memoryId": 1,
  "taskRunId": 1,
  "changedFiles": ["frontend/lib/page.dart"],
  "guardRules": ["DS-BREAKPOINT"],
  "validation": ["make frontend-design-system-usage-guard"]
}
```

### `audit_task_result`

Input:

```json
{
  "taskSessionId": "tsk_20260526_000000_abc123",
  "validationResults": [{ "command": "python scripts/quality/check_role_visual_system_guard.py", "result": "passed" }]
}
```

### `discover_code`

Input:

```json
{ "task": "新增 athlete dashboard training trend card", "limit": 15 }
```

Data shape:

```json
{
  "mode": "discovery",
  "task": "新增 athlete dashboard training trend card",
  "authoritativeHandoff": {
    "mode": "strict_discovery",
    "confidence": 0.88,
    "chainStatus": "verified_chain",
    "chainDepth": 4,
    "chainCompleteness": "route_test_covered",
    "testCoverage": {
      "covered": true,
      "coverageStrength": "strong",
      "testFiles": ["frontend/test/modules/user_core/dashboard/athlete_dashboard_home_sections_test.dart"],
      "evidence": []
    },
    "mustRead": [],
    "coreChain": [],
    "reuseDecision": {
      "verdict": "extend_existing",
      "candidate": "TrainingTrendCard",
      "path": "frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_sections.dart",
      "apiFit": { "requiredParamsCovered": true, "missingParams": [], "breakingChangeRisk": "low" },
      "recommendedAction": "Extend TrainingTrendCard with optional API rather than creating a duplicate component. Review existing callers before changing shared API.",
      "affectedCallers": ["frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_sections.dart"],
      "evidence": ["reuse_similarity", "extend_existing", "api_fit"]
    },
    "impactSummary": {},
    "supportingContext": [
      {
        "path": "frontend/lib/l10n/l10n.dart",
        "why": "support dependency",
        "evidence": ["ranked_discovery"],
        "role": "supporting_dependency",
        "confidence": 0.77,
        "reason": "import_only_l10n_wrapper",
        "reasonDetail": "Localization wrapper is an import-only support dependency."
      }
    ],
    "suppressedCandidates": [
      {
        "path": "frontend/e2e/maestro/dashboard_flow.yaml",
        "reason": "e2e_artifact",
        "reasonDetail": "End-to-end artifact should not drive primary code discovery.",
        "downgradedTo": "ignoreForNow",
        "confidence": 0.9,
        "evidence": ["ranked_discovery"],
        "score": 0.71
      }
    ],
    "strictGate": {},
    "workflowProtocol": {
      "profiles": [{ "name": "openapi_contract_first", "source": "repo_local", "confidence": 0.98 }],
      "actions": [
        {
          "type": "run_sdk_generate",
          "command": "npm run sdk:generate",
          "required": true,
          "reason": "Generated SDK files must be refreshed from the OpenAPI contract.",
          "sourceProfile": "openapi_contract_first",
          "source": "repo_local"
        }
      ],
      "recommendedCommands": [{ "command": "npm run sdk:check", "required": true }],
      "newFileExpectations": [],
      "editPolicies": [
        {
          "path": "frontend/uniapp-shell/src/utils/sdk/generated/**",
          "policy": "read_only",
          "reason": "Generated SDK output is updated by sdk:generate, not manual edits."
        }
      ],
      "gateSteps": [{ "id": "openapi_before_generated_sdk", "required": true }]
    }
  },
  "entrypoints": [],
  "coreSymbols": [],
  "callGraphPreview": [],
  "reuseCandidates": [],
  "duplicateRisks": [],
  "impactPreview": [],
  "recommendedReadOrder": [],
  "whyRelated": [],
  "relatedTests": { "commands": [], "testFiles": [] },
  "warnings": []
}
```

### `find_entrypoints`

Input:

```json
{ "task": "修改 dashboard 页面", "limit": 10 }
```

Returns likely Flutter routes/pages, FastAPI handlers, commands, tests, and components.

### `trace_feature`

Input:

```json
{ "task": "新增 athlete dashboard trend card", "limit": 5 }
```

Data shape:

```json
{
  "task": "新增 athlete dashboard trend card",
  "mode": "route",
  "routeToWidgetChainApplicability": "applicable",
  "routeToWidgetChain": { "status": "verified_chain", "steps": [], "confidence": 0.86, "warnings": [] },
  "workflowProtocol": { "profiles": [], "actions": [], "recommendedCommands": [] },
  "workflowChain": [],
  "chains": [
    {
      "entrypoint": "AthleteDashboardPage",
      "path": [
        {
          "type": "flutter_page_widget",
          "target": "frontend/lib/page.dart",
          "why": "entrypoint match",
          "evidence": []
        },
        { "type": "implementation", "target": "frontend/lib/widget.dart", "why": "import binding", "evidence": [] },
        { "type": "test", "target": "frontend/test/page_test.dart", "why": "related test", "evidence": [] }
      ],
      "confidence": 0.86
    }
  ],
  "warnings": []
}
```

When a repo-local workflow profile matches a non-route task, `trace_feature` returns
`mode: "workflow"`, `routeToWidgetChainApplicability: "not_applicable"`, a populated
`workflowProtocol`, and a `workflowChain` instead of pretending the task has a verified
route/page/widget chain.

### `find_callers` / `find_callees` / `trace_symbol`

Input:

```json
{ "query": "AthleteDashboardHomeWidgets.buildTrendCard", "limit": 20 }
```

Returns confidence-scored symbol graph hits with evidence such as `exact_local`, `repo_unique_name`, or `ambiguous_name`.

### `find_similar_code`

Input:

```json
{ "target": "AthleteDashboardHomeWidgets.duplicatedSummaryCard", "limit": 10 }
```

Returns deterministic exact or near-duplicate code block matches.

### `find_reusable_components`

Input:

```json
{ "task": "新增 dashboard trend card", "limit": 10 }
```

Returns reusable components/services/hooks and duplicate risks to inspect before creating new code.

### `duplicate_clusters`

Input:

```json
{ "scope": "dashboard", "limit": 20 }
```

Returns persisted normalized duplicate clusters from `similarity_clusters`.

### `explain_reuse`

Input:

```json
{ "task": "新增 dashboard trend card", "limit": 5 }
```

Returns reuse candidates, duplicate risks, overlapping clusters, and a deterministic reuse recommendation.

### `module_map`

Input:

```json
{ "scope": "user_core/dashboard", "limit": 10 }
```

Returns path modules with entrypoints, core files, dependencies, dependents, tests, and duplicate clusters.

### `why_related`

Input:

```json
{
  "target": "frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_widgets.dart",
  "task": "新增 dashboard trend card"
}
```

Returns evidence explaining why a file is related to a task.

### `impact_analysis_v2`

Input:

```json
{
  "query": "AthleteDashboardHomeWidgets.buildTrendCard",
  "includeTests": true,
  "includeEntrypoints": true,
  "includeReuseRisks": true
}
```

Returns callers, callees, impacted files, affected entrypoints, related tests, reuse risks, and risk notes.

### `impact_analysis_v3`

Input:

```json
{ "query": "frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_view.dart", "task": "dashboard trend card" }
```

Returns production impact layers: direct consumers, affected entrypoints, roles, widgets, view models, tests, guards, reuse cluster impact, secondary co-change neighbors, risk level, and evidence notes.

### `production_discovery_eval`

Input:

```json
{
  "suitePath": ".pnav/eval/discovery-suite.json",
  "strict": true,
  "metadataOnly": true,
  "allowStaleCodeGraph": true
}
```

Runs a deterministic discovery eval suite and returns `productionScore` plus per-case metrics.
`metadataOnly` runs a metadata-only incremental preflight before eval so workflow/eval/command/doc
metadata can refresh without rebuilding a dirty source graph. `allowStaleCodeGraph` explicitly
allows eval to proceed when the code graph is stale.

Strict suites can assert workflow protocol fields such as `actionContains`,
`recommendedCommandContains`, `newFileExpected`, `readOnlyContains`, `editPolicyContains`,
`gateStepContains`, `fallbackCommandNotContains`, and `profileSourcesAny`. These assertions add hard
failures without changing the legacy production score.

Data shape:

```json
{
  "suitePath": ".pnav/eval/discovery-suite.json",
  "productionScore": 0.93,
  "totalLatencyMs": 120,
  "slowestStages": [{ "stage": "relatedFilesMs", "latencyMs": 44 }],
  "indexStatus": {
    "workflowProfilesFresh": true,
    "evalSuitesFresh": true,
    "commandsFresh": true,
    "documentsFresh": true,
    "codeGraphFresh": false,
    "codeGraphStale": true,
    "codeGraphStaleReason": "2 code graph path(s) changed; skipped graph rebuild because --metadata-only was used."
  },
  "cacheStats": {
    "workflowProfiles": { "hits": 1, "misses": 1 },
    "entrypoints": { "hits": 1, "misses": 1 }
  },
  "passed": true,
  "cases": [
    {
      "id": "dashboard-noise-suppression",
      "latencyMs": 120,
      "latencyBreakdown": { "workflowProfilesMs": 2, "relatedFilesMs": 44, "totalMs": 120 },
      "metrics": { "suppressionReasonQuality": 1, "productionScore": 0.93 },
      "hardFailures": [],
      "passed": true
    }
  ]
}
```
