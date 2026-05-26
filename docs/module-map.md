# Module Map

`module_map` groups files into path modules such as:

- `frontend/lib/modules/<module>`
- `backend/app/<area>`
- `src/<domain>`
- `packages/<package>`
- `apps/<app>`

Each module can include:

- entrypoints
- core files
- dependencies
- dependents
- tests
- duplicate clusters

CLI:

```bash
pnav modules /path/to/repo user_core/dashboard
```
