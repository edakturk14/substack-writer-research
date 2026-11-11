import { test as base, chromium, expect } from "@playwright/test";

// Each test needs a fresh browser context. Factory's embedded pane does not
// implement Target.createBrowserContext; never silently share user state.
if (process.env.FACTORY_DESKTOP_CDP_PORT) {
  throw new Error(
    "Isolated Playwright contexts are not supported by the Factory browser pane. "
    + "Run npm run test:e2e in a standalone Terminal, or use GitHub Actions. "
    + "Use agent-browser for local embedded-browser smoke checks.",
  );
}

export const test = base.extend({
  browser: [
    async ({ browserName }, provideBrowser) => {
      if (browserName !== "chromium") {
        throw new Error("This verification suite supports Chromium only.");
      }
      const endpoint = process.env.AGENT_BROWSER_CDP;
      const browser = endpoint
        ? await chromium.connectOverCDP(endpoint)
        : await chromium.launch();
      try {
        await provideBrowser(browser);
      } finally {
        // For connectOverCDP, close disconnects this client, not the host browser.
        await browser.close();
      }
    },
    { scope: "worker" },
  ],
});

export { expect };
