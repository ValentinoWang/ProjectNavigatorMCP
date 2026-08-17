# Historical Agent Development Rules

These rules document the constraints introduced during v0.3-v0.8. They are historical context;
the current repository invariants live in the root `AGENTS.md`.

## v0.3

- Do not introduce Postgres, Tree-sitter, LSP, or a Web UI as the main path.
- Preserve the MCP envelope: `repo`, `generated_at`, `index_status`, `data`, `warnings`.
- Prefer deterministic rule-based reranking before adding LLM calls.
- Guard findings, source document sync targets, changed files, and canonical guard paths outrank generic keyword results.

## v0.4

- `editBoundaryV2` is the authoritative edit boundary.
- `minimalRepairPath` is the preferred agent execution path.
- Do not let body-inferred paths, generic Markdown, screenshots, QA manifests, Maestro, or Patrol enter editable boundaries unless explicitly requested.
- Finish-time audit must be deterministic and must not call an LLM.

## v0.5

- Keep Discovery Mode separate from Repair Mode.
- Keep discovery ranking out of repair planner modules.
- Every top discovery result should include deterministic evidence.
- Ambiguous call/reference edges expose lower confidence.
- Reuse detection remains local and deterministic.

## v0.6

- Prefer feature chains over wider candidate lists.
- Persist deterministic import and duplicate evidence in SQLite.
- Incremental scan reports changed/skipped/deleted counts and avoids rebuilding when nothing changed.

## v0.7

- Route, page, and module-root entrypoints outrank internal token-heavy widgets/cards.
- Discovery returns `mustRead`, `shouldInspect`, `reuseBeforeCreate`, and `ignoreForNow`.
- Feature chains declare `verified_chain` or `candidate_chain`.
- Reuse candidates provide a verdict before new code is created.
- Flutter/frontend UI discovery demotes backend, database, infra, screenshot, and E2E noise without explicit evidence.
- Ranking changes need deterministic tests.

## v0.8

- `authoritativeHandoff.mustRead` is short, strict, and evidence-backed.
- `mustRead` is capped at five files by default.
- Import-only files, l10n, API error wrappers, auth caches, loggers, generic helpers, screenshots, and E2E artifacts need explicit evidence to enter `mustRead`.
- Route/page/widget composition edges outrank import edges.
- Unverified chains are labeled `partial_chain` or `candidate_chain`.
- Every dropped candidate has a deterministic suppression reason.
- Production eval is deterministic and does not call an LLM.
