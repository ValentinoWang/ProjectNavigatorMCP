export function extractBody(content: string, startLine: number, endLine: number): string {
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, startLine - 1);
  const end = Math.min(lines.length, Math.max(startLine, endLine));
  return lines.slice(start, end).join("\n");
}

export function findBraceBlockEnd(lines: string[], startIndex: number): number {
  let depth = 0;
  let seenOpening = false;
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = stripStrings(lines[index] ?? "");
    for (const char of line) {
      if (char === "{") {
        depth += 1;
        seenOpening = true;
      } else if (char === "}") {
        depth -= 1;
        if (seenOpening && depth <= 0) {
          return index + 1;
        }
      }
    }
    if (!seenOpening && /=>|;\s*$/.test(line)) {
      return index + 1;
    }
  }
  return startIndex + 1;
}

export function findIndentBlockEnd(lines: string[], startIndex: number): number {
  const startLine = lines[startIndex] ?? "";
  const startIndent = leadingSpaces(startLine);
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      continue;
    }
    if (leadingSpaces(line) <= startIndent) {
      return index;
    }
  }
  return lines.length;
}

export function leadingSpaces(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function stripStrings(line: string): string {
  return line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "");
}
