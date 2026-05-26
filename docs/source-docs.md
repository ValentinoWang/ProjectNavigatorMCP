# Source Document Support

ProjectNavigatorMCP treats selected Markdown files as source documents for implementation tasks.

Source documents are useful when a repo already contains a plan, governance document, migration guide, or design decision record that names the files and validations a coding agent should use.

## Supported Frontmatter

```yaml
---
owner_domain: design_system
authority: canonical
depends_on:
  - docs/role-visual-system.md
sync_targets:
  - scripts/quality/check_role_visual_system_guard.py
  - frontend/lib/modules/design_system/theme/experience_theme.dart
validation:
  - python scripts/quality/check_role_visual_system_guard.py
  - python scripts/quality/check_design_system_usage_guard.py
---
```

Fields:

- `owner_domain`: the project area that owns the document.
- `authority`: the role of the document, such as `canonical`, `design_governance`, or `migration_plan`.
- `depends_on`: related documents that should be considered supporting context.
- `sync_targets`: source files, tests, guards, or docs that must stay aligned with this document.
- `validation`: commands that should appear in the execution plan.

## Ranking Rules

When a source document is passed to `prepare_task_context`, deterministic signals outrank generic keyword matches:

1. Guard output `file:line`.
2. `source_doc` frontmatter `sync_targets`.
3. `source_doc` validation command targets.
4. `source_doc` `depends_on`.
5. Project config domain paths.
6. Symbol and path token matches.
7. Generic Markdown matches.

Generic Markdown files and `agents-results` logs are demoted unless explicitly passed as `source_doc`.

## Parse Modes

v0.3 supports three parse modes:

- `frontmatter`: structured frontmatter provides the main targets and validation commands.
- `mixed`: frontmatter exists, and additional paths or commands were inferred from the body.
- `inferred`: no structured frontmatter was found; targets and commands were inferred from headings, checklists, paths, and fenced shell blocks.

Inferred documents receive lower `docConfidence` and `sourceWarnings` so agents know to treat them as helpful hints rather than canonical instructions.

## Scan Behavior

`pnav scan <repo>` indexes Markdown files that contain source-document signals and at least one target or execution step. Indexed data is stored in:

- `documents`
- `document_targets`
- `document_steps`

If a `source_doc` has not been indexed yet, `prepare_task_context` analyzes it directly and returns a warning.
