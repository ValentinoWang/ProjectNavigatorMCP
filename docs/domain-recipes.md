# Domain Recipes

Domain recipes are v0.4's stronger replacement for one-off domain gates.

They define aliases, positive paths, negative paths, inspect-only paths, default do-not-touch paths, preferred commands, suppressed commands, and minimal repair templates.

## Example

```json
{
  "name": "frontend_design_system",
  "aliases": ["frontend_visual_system", "role_visual_system", "design_system", "flutter_design_system"],
  "positivePaths": ["frontend/lib/**", "frontend/test/**", "scripts/quality/**"],
  "negativePaths": ["backend/**", "database/**", "infra/**"],
  "inspectOnlyPaths": ["scripts/quality/**", "develop/**"],
  "defaultDoNotTouch": ["backend/**", "database/**"],
  "preferredCommands": ["*role_visual*", "*design_system_usage*"],
  "suppressedCommands": ["*maestro*", "*patrol*", "*screenshot*"],
  "minimalRepairTemplate": [
    "open_guard_location",
    "inspect_canonical_token_source",
    "apply_recipe",
    "run_primary_guard",
    "run_secondary_guard"
  ]
}
```

Guard findings, explicit `source_doc` targets, and explicit `changed_files` are not hidden by negative paths, but negative-domain results are demoted or moved to do-not-touch tiers.
