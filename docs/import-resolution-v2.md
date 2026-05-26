# Import Resolution V2

v0.6 persists import bindings in SQLite.

Supported first-pass cases:

- relative imports
- bare sibling imports such as `foo.dart`
- Dart `package:` imports into `frontend/lib`
- Python dotted imports
- TypeScript/JavaScript relative imports

Each binding stores:

- imported name
- local name
- source text
- resolved file
- confidence
- evidence

This is used by feature tracing and future call graph precision improvements.
