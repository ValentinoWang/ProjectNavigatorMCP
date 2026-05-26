export function normalizeCommand(command: string): string {
  let normalized = command.trim();
  const bashLc = normalized.match(/^bash\s+-lc\s+["'](.+)["']$/);
  if (bashLc) {
    normalized = bashLc[1];
  }
  normalized = normalized.replace(/^python3?\s+/, "");
  normalized = normalized.replace(/^bash\s+/, "");
  normalized = normalized.replace(/^sh\s+/, "");
  normalized = normalized.replace(/^\.\//, "");
  return normalized.replace(/\s+/g, " ").trim();
}
