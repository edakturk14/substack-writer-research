import type { Page } from "@playwright/test";
import { demoArticles, demoResponse, emptyResponse } from "../../src/lib/fixtures";
import { test, expect } from "./fixtures";

const question = "How can I make a useful newsletter about AI inference?";
const field = (page: Page) => page.getByRole("textbox", { name: "Research question" });
const submit = (page: Page) => page.locator("form").getByRole("button", { name: "Search", exact: true });
const originalLinkName = /^Open original(?: \(opens in a new tab\))?$/;
const card = (page: Page, index = 0) =>
  page.getByRole("article").filter({ hasText: demoArticles[index].title });

async function search(page: Page, query = question) {
  await field(page).fill(query);
  await submit(page).click();
  await expect(card(page)).toBeVisible();
}

test.beforeEach(async ({ page, context, baseURL }) => {
  // Nothing in this suite needs the public Internet, including original links.
  // Individual navigation tests install a later, more-specific route override.
  const origin = new URL(baseURL!).origin;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await page.goto("/");
});

test("the About comparison links to a prefilled search and Search returns home", async ({ page }) => {
  const about = page.getByRole("link", { name: "About", exact: true });
  await expect(page.getByRole("link", { name: "Writer Research", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("aria-current", "page");

  await about.click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(about).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Why this search is different" })).toBeVisible();
  for (const screenshot of await page.getByRole("img").all()) {
    await screenshot.scrollIntoViewIfNeeded();
    await expect.poll(() => screenshot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.getByRole("img")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));

  const example = await page.locator("blockquote").innerText();
  await page.getByRole("link", { name: "Try this question" }).click();
  await expect(field(page)).toHaveValue(example);
  await expect(page.getByRole("article")).toHaveCount(0);
  await submit(page).click();
  await expect(card(page)).toBeVisible();

  await about.click();
  await page.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("aria-current", "page");
});

for (const method of ["button", "Enter"] as const) {
  test(`${method} submits one request and shows honest fixed examples`, async ({ page }) => {
    const requests: unknown[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/search" && request.method() === "POST") {
        requests.push(request.postDataJSON());
      }
    });
    await field(page).fill(question);
    if (method === "Enter") await field(page).press("Enter");
    else await submit(page).click();
    await expect(page.getByRole("article")).toHaveCount(demoArticles.length);
    await expect(page.getByText(/fixed examples/i).first()).toBeVisible();
    await expect(field(page)).toHaveValue(question);
    expect(requests).toEqual([{ query: question }]);
    for (const [index, article] of demoArticles.entries()) {
      await expect(card(page, index)).toContainText(article.title);
      const passage = card(page, index).getByText(article.excerpt!.slice(0, 80), { exact: false });
      await expect(passage).toBeVisible();
      const displayed = (await passage.textContent())!;
      expect(Array.from(displayed).length).toBeLessThanOrEqual(300);
      expect(article.excerpt!.startsWith(displayed.replace(/…$/, ""))).toBe(true);
      if (article.excerpt!.length <= 300) expect(displayed).toBe(article.excerpt);
      await expect(card(page, index).getByRole("link", { name: originalLinkName }))
        .toHaveAttribute("href", article.url);
    }
  });
}

test("a delayed search exposes loading and preserves the query", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/search", async (route) => {
    await gate;
    await route.fulfill({ json: demoResponse });
  });
  await field(page).fill(question);
  await submit(page).click();
  try {
    await expect(page.getByRole("status").filter({ hasText: /searching|loading/i })).toBeVisible();
    await expect(field(page)).toHaveValue(question);
    await expect(page.locator("form button[type=submit]")).toBeDisabled();
  } finally {
    release();
  }
  await expect(card(page)).toBeVisible();
  await expect(field(page)).toHaveValue(question);
});

test("empty results are explicit and a later search recovers", async ({ page }) => {
  await page.route("**/api/search", (route) => route.fulfill({ json: emptyResponse }));
  await field(page).fill(question);
  await submit(page).click();
  await expect(page.getByText(/no (articles|results)|nothing found/i).first()).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(field(page)).toHaveValue(question);
  await page.unroute("**/api/search");
  await search(page);
});

for (const failure of ["HTTP error", "network failure", "malformed JSON", "invalid response shape"] as const) {
  test(`${failure} is safe and recoverable`, async ({ page }) => {
    await page.route("**/api/search", async (route) => {
      if (failure === "network failure") {
        await route.abort("failed");
      } else if (failure === "HTTP error") {
        await route.fulfill({
          status: 503,
          json: { error: { code: "SEARCH_UNAVAILABLE", message: "Search is temporarily unavailable. Please try again." } },
        });
      } else if (failure === "malformed JSON") {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{broken" });
      } else {
        await route.fulfill({ json: { results: "not an array", mode: "demo" } });
      }
    });
    await field(page).fill(question);
    await submit(page).click();
    const searchError = page.getByRole("region", { name: "Search results", exact: true }).getByRole("alert");
    await expect(searchError).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(field(page)).toHaveValue(question);
    await page.unroute("**/api/search");
    await search(page);
    await expect(searchError).toHaveCount(0);
  });
}

test("search has no saving controls and does not use browser storage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    for (const name of ["getItem", "setItem", "removeItem"]) {
      Object.defineProperty(Storage.prototype, name, {
        configurable: true,
        value() { throw new DOMException("Storage blocked", "SecurityError"); },
      });
    }
  });
  await page.goto("/?view=saved");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"))
    .toHaveText(["Search", "About"]);
  await expect(page.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("aria-current", "page");
  await search(page);
  await expect(page.getByRole("button", { name: /^(Save|Saved|Remove)$/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Open original navigates to the exact source without an Internet request", async ({ page, context }) => {
  await search(page);
  const original = demoArticles[0].url;
  await context.route(original, (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><title>Intercepted original</title><p>Original navigation intercepted.</p>",
  }));
  const link = card(page).getByRole("link", { name: originalLinkName });
  await expect(link).toHaveAttribute("href", original);
  if (await link.getAttribute("target") === "_blank") {
    await expect(link).toHaveAttribute("rel", /noopener/);
    const opened = page.waitForEvent("popup");
    await link.click();
    const popup = await opened;
    await expect(popup).toHaveURL(original);
    await expect(popup).toHaveTitle("Intercepted original");
    await popup.close();
  } else {
    await link.click();
    await expect(page).toHaveURL(original);
    await expect(page).toHaveTitle("Intercepted original");
  }
});

test("shows a paid label before opening the article", async ({ page }) => {
  await page.route("**/api/search", (route) => route.fulfill({
    json: { ...demoResponse, results: [{ ...demoArticles[0], paid: true, likes: 0, comments: 0 }, demoArticles[1]] },
  }));
  await search(page);
  await expect(card(page).getByTitle("Full post is for paid subscribers")).toHaveText("$ Paid");
  await expect(card(page)).toContainText("0 likes");
  await expect(card(page)).toContainText("0 comments");
  await expect(card(page, 1).getByTitle("Full post is for paid subscribers")).toHaveCount(0);
  await expect(card(page, 1)).not.toContainText(/0 likes|0 comments/);
});

test("shows engagement without keyword match or changing relevance order", async ({ page }) => {
  await page.route("**/api/search", (route) => route.fulfill({ json: {
    mode: "live",
    results: [
      { ...demoArticles[0], title: "Latency lessons", excerpt: "From a real project.", likes: 7, comments: 0 },
      { ...demoArticles[1], title: "AI inference latency", reactions: 4, comments: 1 },
    ],
  } }));
  await field(page).fill("AI inference latency");
  await submit(page).click();
  const first = page.getByRole("article").first();
  const second = page.getByRole("article").nth(1);
  await expect(first).toContainText("7 likes");
  await expect(first).toContainText("0 comments");
  await expect(second).toContainText("4 reactions");
  await expect(second).toContainText("1 comment");
  await page.getByText("How ranking works", { exact: true }).click();
  await expect(page.getByText(/better for specific questions than Substack’s own search/)).toBeVisible();
  await expect(page.getByText(/keyword match/i)).toHaveCount(0);
});

test("keyboard focus reaches search and card actions without horizontal overflow", async ({ page }) => {
  // Start from the top of the document and use actual Tab navigation.
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
  let reachedInput = false;
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press("Tab");
    if (await field(page).evaluate((element) => element === document.activeElement)) {
      reachedInput = true;
      break;
    }
  }
  expect(reachedInput).toBe(true);
  await expect(field(page)).toBeFocused();
  // The focus ring may be drawn on the field or on its enclosing search panel.
  const focusVisible = await field(page).evaluate((element) => [element, element.closest("form")].some((target) => {
    if (!target) return false;
    const style = getComputedStyle(target);
    return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0)
      || style.boxShadow !== "none";
  }));
  expect(focusVisible).toBe(true);
  await field(page).fill(question);
  await field(page).press("Enter");
  await expect(card(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(submit(page)).toBeFocused();
  const originalLink = card(page).getByRole("link", { name: originalLinkName });
  // Suggestions may appear between the form and the results.
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press("Tab");
    if (await originalLink.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(originalLink).toBeFocused();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

// Public URLs already source-checked; titles/dates below are synthetic test data.
const paginatedArticles = [
  demoArticles[0].url,
  demoArticles[1].url,
  "https://codelikeagirl.substack.com/p/the-messy-reality-of-ai-products",
  "https://ebpfchirp.substack.com/p/11-second-time-to-first-token-on",
  "https://agentautopsies.substack.com/p/agent-autopsy-the-context-strategy",
  "https://howitships.substack.com/p/streaming-feels-slow-even-when-it",
  "https://zohaibdr.substack.com/p/production-ai-chatbots",
].map((url, index) => ({
  url,
  title: `Result ${index + 1}`,
  excerpt: "A passage supplied by the provider. ".repeat(25),
  publishedDate: ["2023-01-01", undefined, "2026-11-10", "2024-01-01", "2025-01-01", "2026-01-01", "2026-10-01"][index],
}));

test("sorting and paging are local and stable", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/search", (route) => {
    requests++;
    return route.fulfill({ json: { mode: "live", results: paginatedArticles } });
  });
  await field(page).fill(question);
  await submit(page).click();
  const headings = page.getByRole("article").getByRole("heading");
  await expect(headings).toHaveText(["Result 1", "Result 2", "Result 3", "Result 4", "Result 5"]);
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(headings).toHaveText(["Result 6", "Result 7"]);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByLabel("Sort by").selectOption("newest");
  await expect(headings).toHaveText(["Result 3", "Result 7", "Result 6", "Result 5", "Result 4"]);
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByLabel("Sort by").selectOption("oldest");
  await expect(headings).toHaveText(["Result 1", "Result 4", "Result 5", "Result 6", "Result 7"]);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(headings).toHaveText(["Result 3", "Result 2"]);
  await page.getByLabel("Sort by").selectOption("relevance");
  await expect(headings).toHaveText(["Result 1", "Result 2", "Result 3", "Result 4", "Result 5"]);
  expect(requests).toBe(1);
  const excerpts = await page.locator("article p").allTextContents();
  expect(excerpts.every((text) => Array.from(text).length <= 300 && text.endsWith("…"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await field(page).fill("Another question");
  await field(page).press("Enter");
  await expect(headings).toHaveText(["Result 1", "Result 2", "Result 3", "Result 4", "Result 5"]);
  expect(requests).toBe(2);
});

test("research desk keeps search near the top and results in one readable column", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Good writing isout there.");
  await expect(page.locator("ol")).toHaveCount(0);
  const inputBox = (await field(page).boundingBox())!;
  expect(inputBox.y + inputBox.height).toBeLessThan(600);
  await search(page);
  const rows = await page.getByRole("article").all();
  const first = (await rows[0].boundingBox())!;
  const second = (await rows[1].boundingBox())!;
  expect(second.x).toBe(first.x);
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  for (const row of rows) {
    await expect(row.getByRole("heading", { level: 3 })).toBeVisible();
    const original = row.getByRole("link", { name: originalLinkName });
    expect((await original.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(rows[0]).toContainText(demoArticles[0].publication!);
  await expect(rows[0]).toContainText(demoArticles[0].author!);
});

test("narrow screen handles long metadata and missing publication without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route("**/api/search", (route) => route.fulfill({ json: {
    mode: "live",
    results: [
      { ...demoArticles[0], title: "A".repeat(200), author: "B".repeat(200), publication: undefined },
      { ...demoArticles[1], excerpt: undefined },
    ],
  } }));
  await field(page).fill(question);
  await submit(page).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.getByRole("article").first()).toContainText("jamwithai.substack.com");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
