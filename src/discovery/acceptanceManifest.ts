import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface AcceptanceManifestVariant {
  id: string;
  family: string;
  role: string;
  routeTemplate: string;
  pageMode: string;
  acceptedVisibleStates: string[];
}

export interface AcceptanceFamilyContract {
  family: string;
  variantCount: number;
  roles: string[];
  routeTemplates: string[];
  pageModes: string[];
  acceptedVisibleStates: string[];
  normalizedRoute: string | null;
  routeConstant: string | null;
  pageWidget: string | null;
  sourceFiles: string[];
  evidenceStates: string[];
  missingAcceptedStates: string[];
  status: "mapped" | "missing_source" | "missing_visible_state_evidence";
}

export interface AcceptanceManifestMatrix {
  kind: "selection_first_acceptance";
  manifestPath: string;
  requiredField: "selectionFirstAcceptance.required";
  requiredFamilies: number;
  requiredVariants: number;
  families: AcceptanceFamilyContract[];
  warnings: string[];
}

interface RawManifestPage {
  id: string;
  artifactScreenId: string | null;
  role: string;
  routeTemplate: string;
  selectionFirstRequired: boolean;
  pageMode: string;
  acceptedVisibleStates: string[];
}

interface ResolvedRoute {
  normalizedRoute: string;
  routeConstant: string | null;
  pageWidget: string | null;
  sourceFile: string | null;
}

export function buildSelectionFirstAcceptanceMatrix(repoPath: string): AcceptanceManifestMatrix | null {
  const manifestPath = findManifest(repoPath);
  if (!manifestPath) {
    return null;
  }
  const relativeManifestPath = toRepoPath(repoPath, manifestPath);
  const pages = parseVisualPagesYaml(readFileSync(manifestPath, "utf8"));
  const required = pages.filter((page) => page.selectionFirstRequired);
  if (required.length === 0) {
    return null;
  }

  const routeConstants = scanRouteConstants(repoPath);
  const routes = scanGoRoutes(repoPath, routeConstants);
  const classes = scanDartClasses(repoPath);
  const warnings: string[] = [];
  const byFamily = new Map<string, AcceptanceManifestVariant[]>();
  for (const page of required) {
    const family = page.artifactScreenId ?? page.id;
    const variant: AcceptanceManifestVariant = {
      id: page.id,
      family,
      role: page.role,
      routeTemplate: page.routeTemplate,
      pageMode: page.pageMode,
      acceptedVisibleStates: page.acceptedVisibleStates
    };
    byFamily.set(family, [...(byFamily.get(family) ?? []), variant]);
  }

  const families = Array.from(byFamily.entries())
    .map(([family, variants]) => {
      const normalizedRoute = normalizeRouteTemplate(variants[0]?.routeTemplate ?? "");
      const route = normalizedRoute ? resolveRoute(normalizedRoute, routes, classes) : null;
      if (!normalizedRoute) {
        warnings.push(`${family} has no routeTemplate to reverse-map.`);
      } else if (!route?.sourceFile) {
        warnings.push(`${family} could not be reverse-mapped from ${normalizedRoute} to a Flutter page source.`);
      }
      const sourceFiles = route?.sourceFile ? [route.sourceFile] : [];
      const acceptedVisibleStates = unique(variants.flatMap((variant) => variant.acceptedVisibleStates));
      const evidenceStates = sourceFiles.flatMap((file) => visibleStateEvidence(repoPath, file, acceptedVisibleStates));
      const missingAcceptedStates = acceptedVisibleStates.filter((state) => !evidenceStates.includes(state));
      const status =
        sourceFiles.length === 0
          ? "missing_source"
          : evidenceStates.length > 0
            ? "mapped"
            : "missing_visible_state_evidence";
      if (status === "missing_visible_state_evidence") {
        warnings.push(`${family} maps to ${sourceFiles.join(", ")} but has no visible-state source evidence.`);
      }
      return {
        family,
        variantCount: variants.length,
        roles: unique(variants.map((variant) => variant.role)),
        routeTemplates: unique(variants.map((variant) => variant.routeTemplate)),
        pageModes: unique(variants.map((variant) => variant.pageMode)),
        acceptedVisibleStates,
        normalizedRoute,
        routeConstant: route?.routeConstant ?? null,
        pageWidget: route?.pageWidget ?? null,
        sourceFiles,
        evidenceStates: unique(evidenceStates),
        missingAcceptedStates,
        status
      } satisfies AcceptanceFamilyContract;
    })
    .sort((a, b) => a.family.localeCompare(b.family));

  return {
    kind: "selection_first_acceptance",
    manifestPath: relativeManifestPath,
    requiredField: "selectionFirstAcceptance.required",
    requiredFamilies: families.length,
    requiredVariants: required.length,
    families,
    warnings
  };
}

export function explicitAcceptanceFamiliesFromTask(
  matrix: AcceptanceManifestMatrix,
  task: string
): AcceptanceFamilyContract[] {
  const lowered = task.toLowerCase();
  return matrix.families.filter((family) => {
    const familyKey = family.family.toLowerCase();
    const compactFamily = familyKey.replace(/^url-/, "").replace(/-/g, " ");
    return lowered.includes(familyKey) || lowered.includes(compactFamily);
  });
}

function findManifest(repoPath: string): string | null {
  const candidates = ["tests/mobile/visual_pages.yaml", "tests/mobile/visual_pages.yml"];
  return (
    candidates.map((candidate) => path.join(repoPath, candidate)).find((candidate) => existsSync(candidate)) ?? null
  );
}

function parseVisualPagesYaml(text: string): RawManifestPage[] {
  const pages: RawManifestPage[] = [];
  let current: RawManifestPage | null = null;
  let inSelectionFirst = false;
  let inAcceptedStates = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const newPage = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (newPage) {
      if (current) {
        pages.push(current);
      }
      current = {
        id: cleanYamlScalar(newPage[1] ?? ""),
        artifactScreenId: null,
        role: "",
        routeTemplate: "",
        selectionFirstRequired: false,
        pageMode: "",
        acceptedVisibleStates: []
      };
      inSelectionFirst = false;
      inAcceptedStates = false;
      continue;
    }
    if (!current) {
      continue;
    }
    const selectionField = inSelectionFirst ? line.match(/^\s{4,8}([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/) : null;
    if (selectionField) {
      const [, key, value = ""] = selectionField;
      inAcceptedStates = key === "acceptedVisibleStates";
      if (key === "required") current.selectionFirstRequired = cleanYamlScalar(value) === "true";
      if (key === "pageMode") current.pageMode = cleanYamlScalar(value);
      continue;
    }
    const listItem = line.match(/^\s*-\s*(.+)$/);
    if (inAcceptedStates && listItem) {
      current.acceptedVisibleStates.push(cleanYamlScalar(listItem[1] ?? ""));
      continue;
    }
    const top = line.match(/^\s{2,4}([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/);
    if (top) {
      const [, key, value = ""] = top;
      inSelectionFirst = key === "selectionFirstAcceptance";
      inAcceptedStates = false;
      if (key === "artifactScreenId") current.artifactScreenId = cleanYamlScalar(value);
      if (key === "role") current.role = cleanYamlScalar(value);
      if (key === "routeTemplate") current.routeTemplate = cleanYamlScalar(value);
    }
  }
  if (current) {
    pages.push(current);
  }
  return pages;
}

function scanRouteConstants(repoPath: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const file of dartFiles(repoPath)) {
    const text = readFileSync(path.join(repoPath, file), "utf8");
    const classMatches = text.matchAll(/class\s+([A-Za-z0-9_]*Route(?:Paths|Names))\s*\{([\s\S]*?)\n\}/g);
    for (const match of classMatches) {
      const className = match[1] ?? "";
      const body = match[2] ?? "";
      const local = new Map<string, string>();
      for (const constMatch of body.matchAll(/static\s+const\s+String\s+([A-Za-z0-9_]+)\s*=\s*([^;]+);/g)) {
        const name = constMatch[1] ?? "";
        const rawValue = (constMatch[2] ?? "").trim();
        const value = normalizeDartString(rawValue, local);
        if (value) {
          local.set(name, value);
          constants.set(`${className}.${name}`, value);
        }
      }
    }
  }
  return constants;
}

function scanGoRoutes(repoPath: string, routeConstants: Map<string, string>): ResolvedRoute[] {
  const routes: ResolvedRoute[] = [];
  const classes = scanDartClasses(repoPath);
  for (const file of dartFiles(repoPath).filter((item) => /router|routes|routing/.test(item))) {
    const text = readFileSync(path.join(repoPath, file), "utf8");
    for (const match of text.matchAll(/GoRoute\s*\(([\s\S]*?)(?=\n\s*GoRoute\s*\(|\n\s*\]\s*[),]|$)/g)) {
      const block = match[1] ?? "";
      const pathRef = block.match(/path:\s*([A-Za-z0-9_.]+|'[^']+'|"[^"]+")/)?.[1];
      const widgets = Array.from(block.matchAll(/(?:=>|return)\s+(?:const\s+)?([A-Z][A-Za-z0-9_]*)/g))
        .map((item) => item[1])
        .filter((item): item is string => Boolean(item));
      const widget = widgets.find((item) => !isFallbackPageWidget(item)) ?? widgets[0] ?? null;
      const normalizedRoute = pathRef ? normalizeRouteConstantValue(pathRef, routeConstants) : null;
      if (!pathRef || !normalizedRoute) {
        continue;
      }
      routes.push({
        normalizedRoute,
        routeConstant: pathRef.includes(".") ? pathRef : null,
        pageWidget: widget,
        sourceFile: widget ? (classes.get(widget) ?? null) : null
      });
    }
  }
  return routes;
}

function isFallbackPageWidget(widget: string): boolean {
  return /NotFound|Error|Unauthorized|Forbidden/.test(widget);
}

function resolveRoute(
  normalizedRoute: string,
  routes: ResolvedRoute[],
  classes: Map<string, string>
): ResolvedRoute | null {
  const exact = routes.find((route) => route.normalizedRoute === normalizedRoute);
  if (exact) {
    return exact;
  }
  const withoutQuery = normalizedRoute.split("?")[0] ?? normalizedRoute;
  const loose = routes.find((route) => route.normalizedRoute.split("?")[0] === withoutQuery);
  if (loose) {
    return loose;
  }
  const inferredWidget = inferWidgetNameFromRoute(normalizedRoute);
  return inferredWidget && classes.has(inferredWidget)
    ? {
        normalizedRoute,
        routeConstant: null,
        pageWidget: inferredWidget,
        sourceFile: classes.get(inferredWidget) ?? null
      }
    : null;
}

function scanDartClasses(repoPath: string): Map<string, string> {
  const classes = new Map<string, string>();
  for (const file of dartFiles(repoPath)) {
    const text = readFileSync(path.join(repoPath, file), "utf8");
    for (const match of text.matchAll(/\bclass\s+([A-Z][A-Za-z0-9_]*)\b/g)) {
      const className = match[1];
      if (className && !classes.has(className)) {
        classes.set(className, file);
      }
    }
  }
  return classes;
}

function dartFiles(repoPath: string): string[] {
  const roots = ["frontend/lib", "lib"];
  const files: string[] = [];
  for (const root of roots) {
    const absoluteRoot = path.join(repoPath, root);
    if (!existsSync(absoluteRoot)) {
      continue;
    }
    walk(absoluteRoot, (file) => {
      if (file.endsWith(".dart")) {
        files.push(toRepoPath(repoPath, file));
      }
    });
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function visibleStateEvidence(repoPath: string, filePath: string, acceptedVisibleStates: string[]): string[] {
  const absolutePath = path.join(repoPath, filePath);
  if (!existsSync(absolutePath)) {
    return [];
  }
  const text = readFileSync(absolutePath, "utf8");
  const evidence = new Set<string>();
  const checks: Record<string, RegExp[]> = {
    athleteSelector: [
      /ActiveViewScopeRequiredPanel/,
      /showActiveViewScopeSelectorSheet/,
      /PinnedGlobalHudBar/,
      /ActiveViewSelectionMode\.singleAthlete/,
      /athlete_selector|athlete.*selector/i
    ],
    organizationAthleteBoard: [
      /organizationAthleteBoard/,
      /organization.*roster/i,
      /athlete.*board/i,
      /AthleteListPage/
    ],
    activeViewSelectionSummary: [
      /ActiveViewSelectionBar/,
      /active_view_selection_bar/,
      /active_view_selection_selected_count/,
      /selection.*summary/i,
      /selectionFirstBlocked/
    ]
  };
  for (const state of acceptedVisibleStates) {
    if ((checks[state] ?? []).some((pattern) => pattern.test(text))) {
      evidence.add(state);
    }
  }
  return Array.from(evidence);
}

function normalizeRouteTemplate(routeTemplate: string): string | null {
  const route = routeTemplate.trim();
  if (!route) {
    return null;
  }
  return route
    .replace(/\{athleteId\}/g, ":id")
    .replace(/\{id\}/g, ":id")
    .replace(/\{([^}]+)\}/g, ":$1");
}

function normalizeRouteConstantValue(value: string, routeConstants: Map<string, string>): string | null {
  if (/^['"]/.test(value)) {
    return cleanYamlScalar(value);
  }
  return routeConstants.get(value) ?? null;
}

function normalizeDartString(rawValue: string, localConstants: Map<string, string>): string | null {
  const interpolated = rawValue.match(/^['"]([^'"]*)['"]$/)?.[1] ?? rawValue.replace(/^['"]|['"]$/g, "");
  if (!interpolated.includes("$")) {
    return interpolated;
  }
  return interpolated.replace(/\$([A-Za-z0-9_]+)/g, (_whole, name: string) => localConstants.get(name) ?? "");
}

function inferWidgetNameFromRoute(normalizedRoute: string): string | null {
  if (normalizedRoute.includes("personal-bests")) return "AthletePbManagePage";
  if (normalizedRoute.includes("medical-workspace")) return "MedicalWorkspacePage";
  if (normalizedRoute.includes("assessment")) return "AssessmentWorkspacePage";
  return null;
}

function cleanYamlScalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) => a.localeCompare(b));
}

function walk(current: string, visit: (absolutePath: string) => void): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".pnav", "node_modules", "build", "dist", ".dart_tool"].includes(entry.name)) {
        continue;
      }
      walk(absolutePath, visit);
    } else if (entry.isFile() && statSync(absolutePath).size <= 1_500_000) {
      visit(absolutePath);
    }
  }
}

function toRepoPath(repoPath: string, absolutePath: string): string {
  return path.relative(repoPath, absolutePath).split(path.sep).join("/");
}
