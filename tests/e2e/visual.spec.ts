import { demoArticles } from "../../src/lib/fixtures";
import { test, expect } from "./fixtures";

// Keep this query, result data, and viewport sizes fixed for redesign comparisons.
test("research desk screenshot", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Research question" })
    .fill("How writers find ideas for their newsletter");
  await page.locator("form").getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(demoArticles.length);
  await expect(page.getByRole("article").first().getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("research-desk.png"), fullPage: true });
});
