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

v0.2 uses deterministic navigation signals before broad keyword matching:

1. Guard output `file:line`.
2. `source_doc` frontmatter `sync_targets`.
3. `source_doc` validation command targets.
4. `source_doc` `depends_on`.
5. Project config domain paths.
6. Symbol and path token matches.
7. Generic Markdown matches.

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
  "include_dirty_status": true
}
```

Data shape:

```json
{
  "task": "修复 microplan 页面滚动问题",
  "sourceDoc": {
    "path": "develop/前端/角色视觉设计系统一致性治理完整方案.md",
    "ownerDomain": "frontend_visual_system",
    "authority": "design_governance",
    "syncTargets": ["scripts/quality/check_role_visual_system_guard.py"]
  },
  "guardFindings": [{ "file": "frontend/lib/page.dart", "line": 9, "message": "Raw breakpoint is not allowed." }],
  "readOrder": [{ "path": "frontend/lib/page.dart", "why": "Guard failure location", "score": 1 }],
  "executionPlan": [
    {
      "order": 1,
      "title": "Fix frontend/lib/page.dart:9",
      "command": "bash scripts/quality/run_frontend_design_system_usage_guard.sh --mode ci"
    }
  ],
  "editBoundary": { "preferredFiles": ["frontend/lib/page.dart"], "doNotTouchWithoutReason": [] },
  "dirtyWorktree": { "dirty": true, "summary": { "modifiedCount": 42, "stagedCount": 0, "untrackedCount": 3 } },
  "relatedFiles": [],
  "symbols": [],
  "routes": [],
  "relatedTests": { "commands": [], "testFiles": [] },
  "projectRules": [],
  "memoryHits": [],
  "nextSteps": []
}
```

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

Data shape:

```json
{ "stored": true, "memoryId": 12 }
```
