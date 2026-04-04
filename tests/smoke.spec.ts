import { test, expect } from "@playwright/test";

test("homepage renders", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("body")).toContainText(/home|shop|brands/i);
});

test("brands page renders", async ({ page }) => {
  const res = await page.goto("/brands");
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("body")).toContainText(/shop by brand/i);
});
