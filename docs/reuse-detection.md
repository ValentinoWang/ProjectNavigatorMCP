# Reuse Detection

v0.5 finds reusable implementation candidates and duplicate risks without a vector database.

The first implementation uses:

- symbol body extraction
- comment/string/number normalization
- body hashes
- normalized hashes
- token fingerprints
- Jaccard similarity
- path/symbol/domain hints

Tools:

- `find_similar_code`
- `find_reusable_components`

This is intended to prevent duplicate components, cards, services, hooks, and helpers before the agent writes new code.
