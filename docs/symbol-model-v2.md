# Symbol Model V2

v0.5 enriches symbols with navigation-oriented metadata:

- `qualified_name`
- `container_name`
- `signature`
- `parameters_json`
- `return_type`
- `visibility`
- `body_start_line`
- `body_end_line`
- `body_hash`
- `normalized_fingerprint`
- `language_kind`

The scanner also writes `code_blocks` for symbol bodies. These blocks power call graph extraction, reuse search, duplicate detection, and impact analysis.
