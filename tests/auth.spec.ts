import { expect, test } from "@playwright/test";

test("login then logout", async ({ page }) => {
  test.setTimeout(90000);

  const email = process.env.TEST_EMAIL || "";
  const password = process.env.TEST_PASSWORD || "";

  if (!email || !password) {
    test.skip(true, "TEST_EMAIL and TEST_PASSWORD not set");
  }

  await page.goto("/");
  await page.waitForSelector("#auth-tab-signup", { timeout: 30000 });

  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);
  await page.locator("#auth-primary-btn").click();

  const authMessage = page.locator("#auth-message");
  if (await authMessage.isVisible()) {
    const msg = (await authMessage.textContent())?.trim() || "";
    if (msg) throw new Error(`Login failed: ${msg}`);
  }

  await expect(page.locator("#header-sub")).not.toContainText(
    "Accountability Challenge", { timeout: 20000 }
  );
  await expect(page.locator("#header-sub")).toContainText("·");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Sign in / Create account")).toBeVisible({ timeout: 10000 });
});
