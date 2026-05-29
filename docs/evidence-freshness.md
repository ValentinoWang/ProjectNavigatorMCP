# Evidence Freshness

Evidence can carry:

```text
fresh | partial | weak | stale | stale_until_full_scan | metadata_only
```

Rules:

- `fresh` and `partial` can support strong evidence.
- `weak` is secondary evidence.
- `stale` and `stale_until_full_scan` cannot be the only reason for `mustRead` or critical impact.
- `metadata_only` validates workflow/profile/protocol, not fresh source graph semantics.

Co-change evidence is `stale_until_full_scan` after partial updates because it is derived from Git
history rather than current file contents.
