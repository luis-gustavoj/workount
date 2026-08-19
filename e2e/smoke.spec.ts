import { expect, test } from "@playwright/test";

test("the app serves a page", async ({ page }) => {
  // `/` is the landing page since ticket 025 — the one route that answers 200
  // to an anonymous request, which is what makes it the right smoke target.
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Workount/);
});
