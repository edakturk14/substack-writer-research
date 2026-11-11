import { expect, test } from "vitest";
import config from "../../next.config";

test("does not restore the Turbopack dev cache that causes restart reload loops", () => {
  expect(config.experimental?.turbopackFileSystemCacheForDev).toBe(false);
  expect(config.experimental?.turbopackFileSystemCacheForBuild).not.toBe(false);
});
