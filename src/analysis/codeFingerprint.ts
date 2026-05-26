import { createHash } from "node:crypto";

const STOP_WORDS = new Set([
  "if",
  "else",
  "for",
  "while",
  "return",
  "const",
  "final",
  "var",
  "let",
  "new",
  "class",
  "function",
  "async",
  "await",
  "import",
  "export",
  "from",
  "true",
  "false",
  "null",
  "none"
]);

export interface CodeFingerprint {
  bodyHash: string;
  normalizedHash: string;
  fingerprint: string;
  tokens: string[];
}

export function fingerprintCode(body: string): CodeFingerprint {
  const normalized = normalizeCode(body);
  const tokens = tokenizeCode(normalized);
  return {
    bodyHash: sha1(body.trim()),
    normalizedHash: sha1(normalized),
    fingerprint: simhash(tokens),
    tokens
  };
}

export function normalizeCode(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/#.*$/gm, " ")
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, " STR ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " NUM ")
    .replace(/[A-Za-z_][A-Za-z0-9_]*/g, (value) => (STOP_WORDS.has(value.toLowerCase()) ? value.toLowerCase() : "ID"))
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeCode(body: string): string[] {
  const raw = body.toLowerCase().match(/[a-z_][a-z0-9_]*|[{}()[\].,;:+\-*/=<>]/g);
  return (raw ?? []).filter((token) => !STOP_WORDS.has(token) && token.length > 1);
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) {
      intersection += 1;
    }
  }
  return intersection / new Set([...aSet, ...bSet]).size;
}

function simhash(tokens: string[]): string {
  const vector = new Array<number>(32).fill(0);
  for (const token of tokens) {
    const digest = createHash("sha1").update(token).digest();
    for (let bit = 0; bit < 32; bit += 1) {
      const byte = digest[Math.floor(bit / 8)];
      const mask = 1 << (bit % 8);
      vector[bit] += byte & mask ? 1 : -1;
    }
  }
  let value = 0;
  for (let bit = 0; bit < 32; bit += 1) {
    if (vector[bit] > 0) {
      value |= 1 << bit;
    }
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}
