export interface SourceDocFrontmatter {
  ownerDomain?: string;
  authority?: string;
  dependsOn: string[];
  syncTargets: string[];
  validation: string[];
  raw: Record<string, string | string[]>;
}

export interface ParsedMarkdownDocument {
  frontmatter: SourceDocFrontmatter;
  body: string;
  title: string | null;
}

const ARRAY_KEYS = new Set(["depends_on", "sync_targets", "validation"]);

export function parseMarkdownDocument(content: string): ParsedMarkdownDocument {
  const { frontmatterText, body } = splitFrontmatter(content);
  const raw = frontmatterText ? parseSimpleYaml(frontmatterText) : {};
  return {
    frontmatter: {
      ownerDomain: scalar(raw.owner_domain),
      authority: scalar(raw.authority),
      dependsOn: arrayValue(raw.depends_on),
      syncTargets: arrayValue(raw.sync_targets),
      validation: arrayValue(raw.validation),
      raw
    },
    body,
    title: extractTitle(body)
  };
}

function splitFrontmatter(content: string): { frontmatterText: string | null; body: string } {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatterText: null, body: normalized };
  }
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) {
    return { frontmatterText: null, body: normalized };
  }
  const afterMarker = normalized.indexOf("\n", end + 4);
  return {
    frontmatterText: normalized.slice(4, end).trim(),
    body: afterMarker >= 0 ? normalized.slice(afterMarker + 1) : ""
  };
}

function parseSimpleYaml(text: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  let currentArrayKey: string | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }
    const arrayItem = line.match(/^\s*-\s+(.+)$/);
    if (arrayItem && currentArrayKey) {
      const existing = result[currentArrayKey];
      result[currentArrayKey] = [...arrayValue(existing), cleanScalar(arrayItem[1])];
      continue;
    }

    currentArrayKey = null;
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }
    const key = pair[1];
    const value = pair[2].trim();
    if (!value && ARRAY_KEYS.has(key)) {
      result[key] = [];
      currentArrayKey = key;
      continue;
    }
    result[key] = parseInlineValue(value);
  }
  return result;
}

function parseInlineValue(value: string): string | string[] {
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => cleanScalar(item))
      .filter(Boolean);
  }
  return cleanScalar(value);
}

function cleanScalar(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function arrayValue(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

function extractTitle(body: string): string | null {
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return title && title.length > 0 ? title : null;
}
