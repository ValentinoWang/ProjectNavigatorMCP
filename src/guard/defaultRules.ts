import type { GuardRule } from "./guardRecipe.js";

export const DEFAULT_GUARD_RULES: GuardRule[] = [
  {
    id: "DS-BREAKPOINT",
    domain: "frontend_design_system",
    severity: "error",
    match: {
      commandContains: ["design_system", "design-system", "role_visual", "role-visual", "breakpoint"],
      outputRegex: ["DS-BREAKPOINT", "breakpoint", "raw width", "magic number", "shared responsive"]
    },
    canonicalPaths: [
      "frontend/lib/modules/design_system/theme/experience_theme.dart",
      "scripts/quality/check_role_visual_system_guard.py"
    ],
    recipe: {
      title: "Replace raw breakpoint or magic width with design-system breakpoint token",
      steps: [
        "Open the failing Dart file at the reported line.",
        "Open the canonical design-system theme or breakpoint token file before editing.",
        "Replace raw width or private breakpoint logic with the approved design-system token/API.",
        "Do not weaken, bypass, or baseline the guard.",
        "Re-run the same guard command first, then broader design-system validation."
      ],
      validationCommands: [
        "python scripts/quality/check_role_visual_system_guard.py",
        "python scripts/quality/check_frontend_design_system_usage_guard.py"
      ],
      forbiddenPatterns: ["Do not add raw breakpoint constants", "Do not disable the guard"]
    }
  },
  {
    id: "ROLE-VISUAL-SYSTEM",
    domain: "frontend_design_system",
    severity: "error",
    match: {
      commandContains: ["role_visual", "role-visual", "visual_system"],
      outputRegex: ["role visual", "private role palette", "RoleColors", "PersonaColors", "ExperienceColors"]
    },
    canonicalPaths: [
      "frontend/lib/modules/design_system/theme/experience_theme.dart",
      "scripts/quality/check_role_visual_system_guard.py"
    ],
    recipe: {
      title: "Route role visual differences through DSExperienceTheme",
      steps: [
        "Open the failing UI file and locate private role color or palette usage.",
        "Inspect DSExperienceTheme before choosing a replacement.",
        "Replace page-level role color maps with semantic design-system tokens.",
        "Keep product-surface differences in the canonical theme layer.",
        "Re-run the role visual guard before wider validation."
      ],
      validationCommands: [
        "python scripts/quality/check_role_visual_system_guard.py",
        "make frontend-design-system-usage-guard"
      ],
      forbiddenPatterns: ["Do not add private role palettes", "Do not map ProductSurface directly to Colors"]
    }
  },
  {
    id: "FRONTEND-DESIGN-SYSTEM-USAGE",
    domain: "frontend_design_system",
    severity: "error",
    match: {
      commandContains: ["design_system", "design-system", "frontend-design-system"],
      outputRegex: ["design system", "DS-", "token", "raw Duration", "raw color", "fontSize"]
    },
    canonicalPaths: [
      "frontend/lib/modules/design_system/theme/experience_theme.dart",
      "scripts/quality/check_frontend_design_system_usage_guard.py"
    ],
    recipe: {
      title: "Replace raw UI values with design-system tokens or components",
      steps: [
        "Open the failing file and identify the raw visual value.",
        "Check existing design-system tokens/components before adding new constants.",
        "Use semantic or component tokens rather than page-local visual constants.",
        "Avoid weakening the guard or adding local wrappers that preserve the old pattern.",
        "Run the design-system usage guard again."
      ],
      validationCommands: ["make frontend-design-system-usage-guard"],
      forbiddenPatterns: ["Do not hide raw values behind local aliases", "Do not edit the guard to pass"]
    }
  }
];
