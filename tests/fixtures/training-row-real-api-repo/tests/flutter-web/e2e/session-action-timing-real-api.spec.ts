import { test, expect } from "@playwright/test";

test("session action timing writes training rows through the real API", async ({ page }) => {
  await page.goto("/training/run/live");
  await page.getByRole("button", { name: "Start row" }).click();
  await page.getByRole("button", { name: "Save action timing" }).click();

  const response = await page.waitForResponse((item) => item.url().includes("/training-sessions/actions"));
  expect(response.ok()).toBeTruthy();
  await expect(page.getByTestId("training-row-logs-written")).toContainText("training_row_logs");
  await expect(page.getByTestId("training-row-metrics-written")).toContainText("training_row_metrics");
});
