import { loadProjectConfig, matchesAnyPattern, type DomainRecipeConfig } from "../config/projectConfig.js";

export function findDomainRecipe(repoPath: string, domainName: string | null | undefined): DomainRecipeConfig | null {
  if (!domainName) {
    return null;
  }
  const normalized = normalize(domainName);
  const config = loadProjectConfig(repoPath);
  return (
    config.domainRecipes.find(
      (recipe) =>
        normalize(recipe.name) === normalized || recipe.aliases.some((alias) => normalize(alias) === normalized)
    ) ?? null
  );
}

export function pathMatchesRecipe(
  path: string,
  recipe: DomainRecipeConfig | null,
  key: "positivePaths" | "negativePaths" | "inspectOnlyPaths" | "defaultDoNotTouch"
): boolean {
  return recipe ? matchesAnyPattern(path, recipe[key]) : false;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
