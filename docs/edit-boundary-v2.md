# Edit Boundary V2

`editBoundaryV2` is the authoritative edit boundary for v0.4 task contexts.

## Tiers

- `mustEditFiles`: direct repair files, usually guard `file:line` findings or explicit changed files.
- `mayEditFiles`: files that may be edited when the task scope requires it, such as explicit `sync_targets`.
- `mayInspectFiles`: canonical token files, guard scripts, validation targets, and other files that should be read before editing elsewhere.
- `referenceOnlyFiles`: `depends_on` docs, body-inferred paths, and supporting references.
- `doNotTouchFiles`: negative-domain paths, unrelated dirty files, guard scripts when not explicitly editable, and configured forbidden paths.

`worktreeBoundary.allowedEditFiles` is derived from:

```text
mustEditFiles + mayEditFiles
```

New MCP clients should treat `editBoundaryV2` as the single source of truth.
