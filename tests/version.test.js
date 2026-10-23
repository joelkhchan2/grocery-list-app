import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The Settings screen shows APP_VERSION (ui.js); sw.js's SHELL cache name is what actually forces
// devices onto new code. They must move together, or the label lies about what a phone is running.
test("APP_VERSION in ui.js matches the service-worker SHELL cache version", () => {
  const ui = readFileSync(new URL("../src/ui.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const appVersion = ui.match(/APP_VERSION\s*=\s*"(v\d+)"/)?.[1];
  const shell = sw.match(/SHELL\s*=\s*"shell-(v\d+)"/)?.[1];
  assert.ok(appVersion && shell, "could not find both version strings");
  assert.equal(appVersion, shell, "bump APP_VERSION (src/ui.js) and SHELL (sw.js) together");
});
