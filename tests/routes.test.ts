import { describe, expect, it } from "vitest";
import { scanTextSymbols } from "../src/scanner/symbolScanner.js";

describe("route scanner", () => {
  it("parses quoted Dart GoRoute paths", () => {
    const result = scanTextSymbols(
      "lib/routes.dart",
      "dart",
      `
final routes = [
  GoRoute(
    path: '/dashboard',
    name: 'dashboard',
    builder: (context, state) => const DashboardPage(),
  ),
];
      `
    );

    expect(result.routes).toEqual([
      expect.objectContaining({
        framework: "flutter_go_router",
        path: "/dashboard",
        name: "dashboard"
      })
    ]);
  });
});
