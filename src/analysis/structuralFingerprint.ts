import { createHash } from "node:crypto";

export interface StructuralFingerprint {
  shapeKind: "flutter_widget" | "service_logic" | "generic";
  shapeHash: string;
  shapeJson: Record<string, unknown>;
  tokens: string[];
}

export function structuralFingerprintForCode(language: string, body: string): StructuralFingerprint {
  if (language === "dart" || /Widget|Card|Column|Row|Text/.test(body)) {
    const widgets = Array.from(body.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*\(/g)).map((match) => match[1]);
    const filtered = widgets.filter((name) => !["String", "Future", "List", "Map"].includes(name));
    return fingerprint("flutter_widget", filtered);
  }
  const calls = Array.from(body.matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)).map((match) => match[1]);
  const control = Array.from(body.matchAll(/\b(if|for|while|try|catch|switch|return)\b/g)).map((match) => match[1]);
  return fingerprint(calls.length > 0 ? "service_logic" : "generic", [...control, ...calls]);
}

function fingerprint(shapeKind: StructuralFingerprint["shapeKind"], tokens: string[]): StructuralFingerprint {
  const compact = tokens.join(">");
  return {
    shapeKind,
    shapeHash: createHash("sha1").update(`${shapeKind}:${compact}`).digest("hex"),
    shapeJson: { shape: `${shapeKind}(${compact})`, size: tokens.length },
    tokens
  };
}
