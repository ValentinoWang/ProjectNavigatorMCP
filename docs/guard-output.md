# Guard Output Analysis and Guard Rule Registry

`analyze_guard_output` converts guard, compiler, test, and linter logs into deterministic navigation signals.

## Supported Patterns

The parser currently recognizes common `file:line` and `file:line:column` patterns:

```text
frontend/lib/page.dart:9
frontend/lib/page.dart:9:12
ERROR scripts/quality/check_rule.py:34
```

It also accepts custom guard output when the line contains a repo-relative path under common roots such as:

- `frontend/`
- `backend/`
- `scripts/`
- `src/`
- `docs/`
- `develop/`
- `tests/`
- `shared/`

## Output

The MCP tool and CLI output include:

- `findings`: parsed file, line, column, rule, message, and confidence.
- `ruleMatches`: matched guard rule recipes from the registry.
- `likelyFixFiles`: ranked files, with direct guard findings first.
- `suggestedActions`: deterministic next steps.
- `validationCommands`: the producing command plus source document validation commands.
- `warnings`: non-fatal parsing or source document issues.

When a rule matches the registry, the output also includes `ruleId`, `domain`, canonical paths, recipe steps, and validation commands. See [Guard Rule Registry](guard-rule-registry.md).

## CLI

```bash
pnav guard <repo> --log guard.log --command "python scripts/quality/check_role_visual_system_guard.py" --source-doc docs/plans/role_visual_system.md
```

## MCP

```json
{
  "output": "frontend/lib/page.dart:9\\nPrivate role palette usage is not allowed.",
  "command": "python scripts/quality/check_role_visual_system_guard.py",
  "source_doc": "docs/plans/role_visual_system.md"
}
```
