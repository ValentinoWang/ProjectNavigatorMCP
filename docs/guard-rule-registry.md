# Guard Rule Registry

Guard rules turn raw guard output into actionable repair recipes.

Rules can come from built-in defaults or project-local `.pnav/guard-rules.json`.

```json
{
  "version": 1,
  "rules": [
    {
      "id": "DS-BREAKPOINT",
      "domain": "frontend_design_system",
      "severity": "error",
      "match": {
        "commandContains": ["design_system", "role_visual"],
        "outputRegex": ["DS-BREAKPOINT", "raw width"]
      },
      "canonicalPaths": [
        "frontend/lib/modules/design_system/theme/experience_theme.dart",
        "scripts/quality/check_role_visual_system_guard.py"
      ],
      "recipe": {
        "title": "Replace raw breakpoint with design-system token",
        "steps": ["Open the failing file.", "Use the canonical design-system token.", "Re-run the guard."],
        "validationCommands": ["python scripts/quality/check_role_visual_system_guard.py"]
      }
    }
  ]
}
```

`analyze_guard_output`, `explain_guard_rule`, and `prepare_task_context` use the registry to return `ruleId`, `domain`, `canonicalPaths`, `recipe`, and `validationCommands`.
