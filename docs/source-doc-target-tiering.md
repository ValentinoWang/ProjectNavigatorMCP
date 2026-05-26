# Source Document Target Tiering

Source document paths are not all equal. v0.4 assigns an evidence tier to each source document target so a random body mention does not become an edit target.

## Evidence Tiers

- `frontmatter_sync`: high-confidence implementation target.
- `frontmatter_validation`: validation or command target.
- `frontmatter_depends`: reference dependency.
- `heading_action_item`: inferred target from an action-oriented heading or checklist.
- `fenced_command`: command from a code block.
- `inline_command`: command from text.
- `body_path_mention`: path mentioned in prose.
- `fallback_keyword`: weak keyword-derived target.

## Boundary Defaults

- `frontmatter_sync` can enter `mayEditFiles`.
- `frontmatter_validation` enters `mayInspectFiles`.
- `frontmatter_depends`, `body_path_mention`, and `fallback_keyword` enter `referenceOnlyFiles` by default.
- Screenshot, QA, OCR, Maestro, Patrol, and mobile E2E paths are suppressed unless the task explicitly asks for them.
