export function extractCallTokens(body: string): string[] {
  const tokens = new Set<string>();
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>{}]*>)?\s*\(/g;
  for (const match of body.matchAll(pattern)) {
    const name = match[1];
    if (!isIgnoredCall(name)) {
      tokens.add(name);
    }
  }
  return Array.from(tokens);
}

function isIgnoredCall(name: string): boolean {
  return new Set(["if", "for", "while", "switch", "return", "print", "debugPrint", "super", "setState", "build"]).has(
    name
  );
}
