import { expect, test } from "@playwright/test";

// Google's consent screen can't (and shouldn't) be scripted — it has bot
// detection, and automating it is against the spirit of the thing (ADR-0003).
// So these tests cover the halves of the flow that live in *our* app: the guard
// that funnels signed-out visitors to the one door, and the shape of that door.
// The full round-trip through Google is verified by the manual acceptance walk.
test.describe("Google-only auth (ADR-0003)", () => {
  // Ticket 025 moved home to /home so `/` could be the public landing page.
  // This is the assertion that would catch the guard being opened by accident:
  // every path in the app begins with a slash, so a `/` public rule written as
  // a prefix test would let all of these through.
  for (const path of [
    "/home",
    "/session",
    "/programs",
    "/history",
    "/settings",
  ]) {
    test(`a signed-out visit to ${path} lands on /sign-in`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in$/);
    });
  }

  test("the landing page is public, and is not the app", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /lifted last time/i }),
    ).toBeVisible();
  });

  test("the privacy policy is public", async ({ page }) => {
    const response = await page.goto("/privacy");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test("the sign-in screen is one button — no email, no password", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(
      page.getByRole("button", { name: /continue with google/i }),
    ).toBeVisible();
    // The entire point of ADR-0003: there is no credential surface to get wrong.
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(page.locator("input[type=email]")).toHaveCount(0);
  });
});
