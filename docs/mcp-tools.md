# MCP Tools

ProjectNavigatorMCP exposes repository intelligence to Codex, Claude Code, and other MCP
clients.

Server command:

```bash
pnav mcp <repo>
```

Example:

```bash
pnav mcp /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

The MCP server reads:

```text
<repo>/.pnav/project.sqlite
```

## MVP Tool List

- `repo_map`
- `find_symbol`
- `find_related_files`
- `trace_route`
- `impact_analysis`
- `related_tests`
- `prepare_task_context`
- `search_project_memory`
- `remember_task`

## Shared Output Rules

All tools should return JSON-compatible objects.

Common fields:

```json
{
  "repo": "repo-name",
  "generated_at": "2026-05-26T00:00:00.000Z",
  "warnings": []
}
```

Scores should be numbers between `0` and `1`.

Confidence should be separated from score when possible:

- `score`: how relevant the result is to this query.
- `confidence`: how reliable the relationship is.

## Tool: repo_map

Return a compact repository map.

### Input

```json
{
  "include_counts": true,
  "include_commands": true
}
```

### Output

```json
{
  "repo": "flutter-transfer",
  "root_path": "/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer",
  "last_scan": "2026-05-26T00:00:00.000Z",
  "languages": [
    {"language": "dart", "files": 2512},
    {"language": "python", "files": 1043},
    {"language": "markdown", "files": 1321}
  ],
  "important_paths": [
    "AGENTS.md",
    "Makefile",
    "frontend/lib",
    "frontend/test",
    "backend/app/api/v1",
    "backend/app/services",
    "backend/repositories"
  ],
  "commands": [
    {"name": "frontend-analyze", "command": "make frontend-analyze", "category": "analyze"},
    {"name": "flutter-test", "command": "make flutter-test", "category": "test"},
    {"name": "ci-local-critical", "command": "make ci-local-critical", "category": "ci"}
  ],
  "warnings": []
}
```

## Tool: find_symbol

Find classes, functions, methods, widgets, providers, and API handlers.

### Input

```json
{
  "query": "IdentityController",
  "kind": "class",
  "limit": 10
}
```

`kind` is optional.

### Output

```json
{
  "matches": [
    {
      "name": "IdentityController",
      "kind": "class",
      "path": "frontend/lib/core/identity/identity_controller.dart",
      "start_line": 1,
      "end_line": 120,
      "signature": "class IdentityController",
      "score": 0.92,
      "confidence": 0.86
    }
  ],
  "warnings": []
}
```

## Tool: find_related_files

Given a natural language task, return likely relevant files.

### Input

```json
{
  "task": "修复 workspace microplan 页面滚动问题",
  "limit": 20,
  "include_tests": true,
  "include_memory": true
}
```

### Output

```json
{
  "task": "修复 workspace microplan 页面滚动问题",
  "files": [
    {
      "path": "frontend/lib/modules/workspace/pages/microplan_page.dart",
      "language": "dart",
      "reason": "Path and symbol names match workspace/microplan task keywords.",
      "score": 0.88,
      "confidence": 0.75
    },
    {
      "path": "frontend/lib/core/router/app_router.dart",
      "language": "dart",
      "reason": "Likely route entry point for workspace pages.",
      "score": 0.71,
      "confidence": 0.7
    }
  ],
  "warnings": []
}
```

## Tool: trace_route

Trace a Flutter route or FastAPI endpoint to its implementation.

### Input

```json
{
  "query": "workspaceMicroplan",
  "framework": "flutter_go_router"
}
```

`framework` is optional.

### Output

```json
{
  "routes": [
    {
      "framework": "flutter_go_router",
      "name": "workspaceMicroplan",
      "path": "/workspace/microplan",
      "route_file": "frontend/lib/core/router/app_router.dart",
      "target_files": [
        "frontend/lib/modules/workspace/pages/microplan_page.dart"
      ],
      "confidence": 0.72
    }
  ],
  "warnings": []
}
```

## Tool: impact_analysis

Estimate what may be affected by changing a file or symbol.

### Input

```json
{
  "target": "frontend/lib/core/identity/identity_controller.dart",
  "target_type": "file",
  "depth": 2,
  "include_tests": true
}
```

`target_type` may be `file` or `symbol`.

### Output

```json
{
  "target": "frontend/lib/core/identity/identity_controller.dart",
  "impacted_files": [
    {
      "path": "frontend/lib/core/di/auth_controller.dart",
      "relationship": "imports",
      "distance": 1,
      "score": 0.76,
      "confidence": 0.76
    },
    {
      "path": "frontend/test/core/identity/identity_controller_bootstrap_test.dart",
      "relationship": "covered_by",
      "distance": 1,
      "score": 0.91,
      "confidence": 0.91
    }
  ],
  "risks": [
    "Identity-specific code paths may differ for athlete, coach, admin, and personal workspace contexts."
  ],
  "warnings": []
}
```

## Tool: related_tests

Recommend tests and Make targets for a task or file list.

### Input

```json
{
  "changed_files": [
    "frontend/lib/core/identity/identity_controller.dart"
  ],
  "task": "修改登录身份切换逻辑",
  "limit": 10
}
```

### Output

```json
{
  "commands": [
    {
      "command": "make frontend-auth-stable-user-guard",
      "reason": "Identity/auth behavior may affect stable-user assumptions.",
      "score": 0.83,
      "confidence": 0.83
    },
    {
      "command": "make frontend-analyze",
      "reason": "Flutter static analysis gate from Makefile.",
      "score": 0.78,
      "confidence": 0.78
    }
  ],
  "test_files": [
    {
      "path": "frontend/test/core/identity/identity_controller_bootstrap_test.dart",
      "reason": "Likely direct test coverage for identity controller.",
      "score": 0.86
    }
  ],
  "warnings": []
}
```

## Tool: prepare_task_context

Build a compact handoff for Codex or Claude Code before editing.

This is the most important MVP tool. `pnav capsule <repo> "<task>"` should use the same
underlying service.

### Input

```json
{
  "task": "调整 session plan 接口字段",
  "max_files": 20,
  "include_memory": true,
  "include_commands": true,
  "format": "markdown"
}
```

`format` may be `markdown` or `json`.

### Output

```json
{
  "task": "调整 session plan 接口字段",
  "interpretation": "Likely backend API contract and generated frontend SDK change.",
  "likely_files": [
    {
      "path": "backend/app/api/v1/session_plans.py",
      "reason": "FastAPI route likely owns session plan API contract.",
      "score": 0.9
    },
    {
      "path": "backend/app/services/session_plan_service.py",
      "reason": "Service layer likely owns business logic.",
      "score": 0.82
    },
    {
      "path": "frontend/packages/api_client",
      "reason": "Generated Dart SDK may need regeneration after API contract changes.",
      "score": 0.7
    }
  ],
  "recommended_commands": [
    "make fetch-openapi",
    "make gen-sdk",
    "make openapi-sdk-drift-guard"
  ],
  "project_rules": [
    "Do not edit shared/api/openapi.json by hand.",
    "Do not patch generated Dart SDK files manually."
  ],
  "memory_hits": [],
  "markdown": "# Task Context Capsule\n\n...",
  "warnings": []
}
```

## Tool: search_project_memory

Search prior task memories and project notes.

### Input

```json
{
  "query": "workspace microplan scroll",
  "limit": 5
}
```

### Output

```json
{
  "matches": [
    {
      "memory_id": 1,
      "topic": "workspace microplan scroll",
      "summary": "Previous issue was caused by nested scroll constraint mismatch.",
      "files": [
        "frontend/lib/modules/workspace/pages/microplan_page.dart"
      ],
      "commands": [
        "make workspace-microplan-scroll-guard"
      ],
      "score": 0.87,
      "created_at": "2026-05-26T00:00:00.000Z"
    }
  ],
  "warnings": []
}
```

## Tool: remember_task

Store a completed task summary in project-local memory.

### Input

```json
{
  "title": "修复 workspace microplan 页面滚动问题",
  "summary": "Root cause was nested scroll constraint mismatch in the workspace microplan page.",
  "changed_files": [
    "frontend/lib/modules/workspace/pages/microplan_page.dart"
  ],
  "tests": [
    "make workspace-microplan-scroll-guard",
    "make flutter-sliver-contract-guard"
  ],
  "notes": [
    "For UI changes, validate 360 / 390 / 768 / 1024 / 1280 / 1440 widths."
  ],
  "tags": [
    "flutter",
    "workspace",
    "scroll"
  ]
}
```

### Output

```json
{
  "stored": true,
  "memory_id": 1,
  "task_id": 1,
  "warnings": []
}
```

## Tool Design Notes

1. Tools should be deterministic and quick.
2. Tools should not edit target project code.
3. Only `remember_task` writes memory data.
4. `pnav scan` is responsible for refreshing the index.
5. All paths returned to agents should be repo-relative paths unless absolute paths are
   explicitly requested.
