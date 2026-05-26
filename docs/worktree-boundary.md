# Worktree Boundary

Dirty worktrees are common during agent work. v0.3 separates allowed task edits from pre-existing dirty context.

`prepare_task_context` returns:

```json
{
  "worktreeBoundary": {
    "dirty": true,
    "allowedEditFiles": ["frontend/lib/page.dart"],
    "preExistingDirtyFiles": ["backend/app/api.py"],
    "riskyDirtyFiles": ["backend/app/api.py"],
    "verifyDiffCommands": ["git diff -- frontend/lib/page.dart", "git status --short"],
    "warnings": ["Worktree is dirty. Treat files outside allowedEditFiles as pre-existing context."]
  }
}
```

Agents should edit only `allowedEditFiles` unless the task gives a clear reason to expand scope. Before finishing, run the suggested diff commands and verify that unrelated dirty files were not modified.
