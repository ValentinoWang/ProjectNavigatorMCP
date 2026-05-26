# Finish-Time Audit

v0.4 adds deterministic finish-time audit through:

- MCP: `audit_task_result`
- CLI: `pnav audit`
- CLI: `pnav finish --audit`

The audit compares the current diff with the task session boundary created by `prepare_task_context` or `pnav start`.

## Checks

- Changed files must stay inside `editBoundaryV2.mustEditFiles` or `editBoundaryV2.mayEditFiles`.
- Inspect-only files should not be modified.
- Reference-only files should not be modified.
- Do-not-touch files produce errors.
- Guard scripts are forbidden unless they are explicitly editable.
- Snapshot, golden, and baseline files require explicit review.
- Required validation commands from `minimalRepairPath` must be marked passed.

## Result

Audit returns `pass`, `warn`, or `fail`, plus violations, changed files grouped by tier, missing validations, and a recommended next action.
