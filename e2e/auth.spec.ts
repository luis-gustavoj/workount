import { expect, test } from "@playwright/test";

// Google's consent screen can't (and shouldn't) be scripted — it has bot
// detection, and automating it is against the spirit of the thing (ADR-0003).
// So these tests cover the halves of the flow that live in *our* app: the guard
// that funnels signed-out visitors to the one door, and the shape of that door.
// The full round-trip through Google is verified by the manual acceptance walk.
test.describe("Google-only auth (ADR-0003)", () => {
  test("a signed-out visit to a protected route lands on /sign-in", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("button", { name: /continue with google/i }),
    ).toBeVisible();
  });

  test("the session player is behind the guard too", async ({ page }) => {
    await page.goto("/session");
    await expect(page).toHaveURL(/\/sign-in$/);
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
