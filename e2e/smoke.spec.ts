import { expect, test } from "@playwright/test";

test("the app serves a page", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Workount/);
});
