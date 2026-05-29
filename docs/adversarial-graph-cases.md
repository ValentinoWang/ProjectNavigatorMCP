# Adversarial Graph Cases

The v0.9 fixture `tests/fixtures/v09-graph-adversarial-repo` covers graph updates that often fail
silently:

- exported symbol rename
- source file delete
- route/widget mutation

The mutation suite lives in `.agents/pnav/v09-mutations.json` so it is durable repo metadata rather
than local `.pnav` cache state.

Future fixture cases should add file move, barrel re-export, test coverage downgrade, OpenAPI DTO
source changes, deleted route targets, and stale duplicate cluster checks.
