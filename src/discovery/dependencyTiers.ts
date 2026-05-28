export type DependencyTier =
  | "core_implementation"
  | "supporting_dependency"
  | "framework_dependency"
  | "irrelevant_import";

export function classifyDependencyTier(task: string, filePath: string, evidenceKinds: string[] = []): DependencyTier {
  const path = filePath.toLowerCase();
  const loweredTask = task.toLowerCase();
  const designSystemTask = /design system|design-system|design_system|设计系统|视觉|token|guard|breakpoint|ds-/.test(
    loweredTask
  );
  if (
    designSystemTask &&
    (path.includes("/modules/design_system/theme/") ||
      path.includes("/tokens/") ||
      path.includes("experience_theme") ||
      path.includes("breakpoint"))
  ) {
    return "core_implementation";
  }
  if (
    !designSystemTask &&
    (path.includes("/modules/design_system/components/") ||
      path.includes("/modules/design_system/foundation/") ||
      path.includes("/modules/design_system/theme/"))
  ) {
    return "supporting_dependency";
  }
  if (
    evidenceKinds.some((kind) => /route_match|route_builds_page|page_composes_widget|widget_composes_widget/.test(kind))
  ) {
    return "core_implementation";
  }
  if (/flutter|riverpod|provider|go_router|material|fastapi|dio|node_modules|package:/.test(path)) {
    return "framework_dependency";
  }
  if (/(l10n|locale|api_error|logger|logging|auth_user_cache|theme|tokens|utils?|helpers?|constants)/.test(path)) {
    return "supporting_dependency";
  }
  const taskTokens = loweredTask.split(/[^a-z0-9_\u4e00-\u9fff]+/u).filter((token) => token.length > 2);
  const hasTaskEvidence = taskTokens.some((token) => path.includes(token));
  return hasTaskEvidence ? "core_implementation" : "irrelevant_import";
}

export function isNoisyDiscoveryPath(task: string, filePath: string): boolean {
  const loweredTask = task.toLowerCase();
  const path = filePath.toLowerCase();
  const frontendIntent = /页面|界面|组件|卡片|widget|flutter|frontend|dashboard|card|ui|视觉/.test(loweredTask);
  const apiIntent = /api|接口|endpoint|schema|字段|backend|fastapi|database/.test(loweredTask);
  if (frontendIntent && !apiIntent && /^(backend|database|infra)\//.test(path)) {
    return true;
  }
  if (
    frontendIntent &&
    !/e2e|maestro|patrol|截图|screenshot/.test(loweredTask) &&
    /(maestro|patrol|screenshot|golden|ocr|qa)/.test(path)
  ) {
    return true;
  }
  return false;
}
