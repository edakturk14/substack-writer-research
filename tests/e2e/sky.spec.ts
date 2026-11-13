import { test, expect } from "./fixtures";

const prompts = [
  "Moving to New York in your 30s",
  "What to see and do in Bryce Canyon in November",
  "Using AI agents to manage your personal finances",
];

test("starter prompts fill and focus the editable field without requesting search", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/search", (route) => {
    requests++;
    return route.fulfill({ json: { mode: "live", results: [] } });
  });
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "Research question" });
  for (const prompt of prompts) {
    const row = page.getByRole("button", { name: new RegExp(prompt) });
    await row.click();
    await expect(field).toHaveValue(prompt);
    await expect(field).toBeFocused();
    await expect(row).toHaveAttribute("aria-pressed", "true");
  }
  expect(requests).toBe(0);
  await field.fill("An edited question");
  await field.press("Enter");
  await expect(page.getByText("No articles found.")).toBeVisible();
  expect(requests).toBe(1);
});

test("header has no brand or seam", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header")).not.toContainText(/Writer Research|Newsletter Research/);
  expect(await page.locator("header").evaluate((element) => {
    const style = getComputedStyle(element);
    return style.backgroundColor === "rgba(0, 0, 0, 0)" && style.borderBottomWidth === "0px";
  })).toBe(true);
});

test("idle page omits the illustrated empty-state block", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Your next good read starts here.")).toHaveCount(0);
  await expect(page.getByText("Start with a question. Leave with a few new perspectives.")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Search results" }).locator("svg")).toHaveCount(0);
});

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
