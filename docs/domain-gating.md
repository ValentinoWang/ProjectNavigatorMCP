# Domain Gating

Domain gates reduce fallback noise after deterministic signals are applied.

They never remove explicit evidence:

- guard failure files stay;
- `source_doc` sync targets stay;
- `changed_files` stay;
- guard recipe canonical paths stay.

They do demote weak fallback matches, such as backend files in a frontend design-system task.

Configure gates in `.pnav/config.json`:

```json
{
  "domainGates": [
    {
      "name": "frontend_design_system",
      "keywords": ["design system", "视觉", "token", "breakpoint", "Flutter"],
      "positivePaths": ["frontend/lib/**", "frontend/test/**", "scripts/quality/**", "develop/前端/**"],
      "negativePaths": ["backend/**", "database/**", "infra/**"],
      "positiveCommands": ["*design_system*", "*role_visual*"],
      "negativeCommands": ["*maestro*", "*patrol*", "*screenshot*", "*backend*"],
      "suppressGenericMarkdown": true,
      "allowNegativeWhenExplicit": true
    }
  ]
}
```

Use `include_debug: true` in `prepare_task_context` to inspect `debug.demotedFiles` and `debug.droppedCommands`.
