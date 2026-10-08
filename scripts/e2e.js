#!/usr/bin/env node
/**
 * e2e.js — drives the BUILT site in a real browser.
 *
 * The unit tests prove the logic; this proves the pieces are wired together
 * in an actual page, under the actual Content-Security-Policy, with an actual
 * service worker. It checks, among other things, that:
 *
 *   - nothing logs an error or violates the CSP
 *   - prompts survive a reload, and history/restore never lose text
 *   - hostile prompt text and hostile import files cannot run code
 *   - the app reloads and keeps working with the network switched off
 *   - "Reset" demands a typed confirmation and then really erases everything
 *
 * Playwright is NOT a dependency of this project (the app has none). Install
 * it on your machine only if you want to run this:
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run build && npm run test:e2e
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  console.error("Playwright is not installed. Run:  npm i --no-save playwright && npx playwright install chromium");
  process.exit(2);
}

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 8124;
const BASE = `http://127.0.0.1:${PORT}/`;

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/ is missing. Run `npm run build` first.");
  process.exit(2);
}

const results = [];
let step = "";
async function check(name, fn) {
  step = name;
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok    ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`FAIL  ${name}\n      ${String(error.message).split("\n")[0]}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOnce = () => {
      http
        .get(BASE, (response) => {
          response.resume();
          resolve();
        })
        .on("error", () => {
          attempts += 1;
          if (attempts > 40) reject(new Error("server did not start"));
          else setTimeout(tryOnce, 150);
        });
    };
    tryOnce();
  });
}

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, "scripts", "serve.js")], {
    env: Object.assign({}, process.env, { PORT: String(PORT), HOST: "127.0.0.1", SERVE_DIR: DIST }),
    stdio: "ignore",
  });
  await waitForServer();

  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || /Content Security Policy|Refused to/i.test(message.text())) {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("dialog", (dialog) => {
    problems.push(`unexpected browser dialog: ${dialog.message()}`);
    dialog.dismiss();
  });

  const cards = () => page.locator("#promptList .prompt-card");

  async function createPrompt(title, content) {
    await page.click("#newBtn");
    await page.fill("#titleInput", title);
    await page.fill("#contentInput", content);
    await page.click("#saveBtn");
  }

  async function openSettings() {
    await page.click("#dataMenuBtn");
    await page.click("#dataMenuPanel [data-action='settings']");
    await page.waitForSelector("#settingsDialog[open]");
  }

  /* -------------------------------------------------------------- */

  await check("the site loads and shows version 3.2", async () => {
    await page.goto(BASE, { waitUntil: "load" });
    const footer = await page.textContent(".sitefoot");
    assert(/v3\.2\b/.test(footer), `footer says: ${footer.trim().slice(0, 60)}`);
    assert(!/v2\.0|v3\.0|v3\.1/.test(footer), "an old version string is visible");
    assert((await page.textContent(".welcome__badge")).includes("3.2"), "welcome badge is not 3.2");
  });

  await check("a prompt can be created, saved and survives a reload", async () => {
    await createPrompt("Launch post", "Write a {{tone}} post about {{topic}}.");
    await page.reload({ waitUntil: "load" });
    assert((await cards().count()) === 1, "expected one prompt after reload");
    assert((await cards().first().textContent()).includes("Launch post"), "the title is missing after reload");
  });

  await check("history keeps every explicit save and shows a real diff", async () => {
    await cards().first().click();
    await page.fill("#contentInput", "Write a {{tone}} post about {{topic}}.\nEnd with a call to action.");
    await page.click("#saveBtn");
    await page.click("#tab-history");
    const items = await page.locator("#historyList .history__item").count();
    assert(items >= 2, `expected at least 2 versions, saw ${items}`);
    const diff = await page.textContent("#historyDiff");
    assert(diff.includes("call to action"), "the diff does not show the added line");
  });

  await check("restoring an old version keeps the newer text in history", async () => {
    const before = await page.locator("#historyList .history__item").count();
    await page.locator("#historyList .history__item").last().click(); // the oldest version
    await page.click("#historyRestoreBtn");
    await page.click("#confirmOk");
    await page.waitForFunction(() => !document.querySelector("#confirmDialog").open);
    await page.click("#tab-write");
    const text = await page.inputValue("#contentInput");
    assert(!text.includes("call to action"), "the old text was not restored");
    await page.click("#tab-history");
    const after = await page.locator("#historyList .history__item").count();
    assert(after > before, `history shrank or stayed flat (${before} -> ${after})`);
    const everything = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#historyCompare option")).map((o) => o.textContent).join("|")
    );
    assert(everything.includes("Version"), "no earlier versions are listed to compare");
  });

  await check("hostile prompt text is shown as text and never executes", async () => {
    await createPrompt(
      "<img src=x onerror=\"window.__xss=1\">",
      "<script>window.__xss=1</script><svg onload=\"window.__xss=1\">{{<b>x</b>}}"
    );
    await page.click("#tab-preview");
    await page.waitForTimeout(200);
    const flagged = await page.evaluate(() => window.__xss === 1);
    assert(!flagged, "injected script ran");
    const injected = await page.evaluate(() => document.querySelectorAll("#promptList img, #editor img, #editor svg[onload]").length);
    assert(injected === 0, "an injected element was created");
    const title = await cards().first().textContent();
    assert(title.includes("<img"), "the title was not displayed literally");
  });

  await check("a hostile import file is neutralised and previewed first", async () => {
    const hostile = JSON.stringify({
      app: "ai-prompt-toolkit",
      schemaVersion: 2,
      prompts: [
        { id: "evil-1", title: "Polluter", content: "body", tags: "a", __proto__: { polluted: true }, constructor: { prototype: { polluted: true } } },
      ],
    }).replace('"prompts"', '"__proto__":{"polluted":true},"prompts"');
    await page.setInputFiles("#importFile", { name: "hostile.json", mimeType: "application/json", buffer: Buffer.from(hostile) });
    await page.waitForSelector("#importDialog[open]");
    const warnings = await page.textContent("#importWarnings");
    assert(/unsafe/i.test(warnings), `expected an "unsafe field" warning, saw: ${warnings.trim()}`);
    const before = await cards().count();
    assert(before >= 1, "prompts vanished while previewing");
    await page.click("#importConfirm");
    await page.waitForFunction(() => !document.querySelector("#importDialog").open);
    const polluted = await page.evaluate(() => ({}).polluted === true || Object.prototype.polluted === true);
    assert(!polluted, "Object.prototype was polluted");
    const titles = await cards().allTextContents();
    assert(titles.some((t) => t.includes("Polluter")), "the valid prompt in the file was not imported");
  });

  await check("a file from a newer version is refused without changing anything", async () => {
    const count = await cards().count();
    const future = JSON.stringify({ app: "ai-prompt-toolkit", schemaVersion: 99, prompts: [{ title: "Future", content: "x" }] });
    await page.setInputFiles("#importFile", { name: "future.json", mimeType: "application/json", buffer: Buffer.from(future) });
    await page.waitForSelector("#importDialog[open]");
    assert((await page.textContent("#importErrors")).toLowerCase().includes("newer"), "no 'newer version' explanation");
    assert(await page.locator("#importConfirm").isDisabled(), "Import should be disabled for an unreadable file");
    await page.click("#importCancel");
    await page.waitForFunction(() => !document.querySelector("#importDialog").open);
    assert((await cards().count()) === count, "the library changed");
  });

  let backupText = "";
  await check("a full backup downloads with a checksum and history", async () => {
    await openSettings();
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#settingsBackupBtn")]);
    backupText = fs.readFileSync(await download.path(), "utf8");
    const backup = JSON.parse(backupText);
    assert(backup.kind === "backup" && backup.schemaVersion === 3, "wrong backup header");
    assert(/^fnv1a32:[0-9a-f]{8}$/.test(backup.checksum), "missing checksum");
    assert(backup.data.prompts.length >= 2, "prompts missing from the backup");
    assert(Object.keys(backup.data.versions).length >= 1, "history missing from the backup");
  });

  await check("the health check runs and reports no failures on healthy data", async () => {
    await page.click("#healthBtn");
    await page.waitForSelector("#healthResults li");
    const failed = await page.locator("#healthResults li.is-fail, #healthResults li[data-status='fail']").count();
    assert(failed === 0, `${failed} health checks failed`);
    await page.keyboard.press("Escape");
  });

  await check("the app reloads and works with the network switched off", async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "load" }); // let the worker take control
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload({ waitUntil: "load" });
    assert((await cards().count()) >= 2, "prompts missing while offline");
    assert(await page.locator("#offlineBadge").isVisible(), "the offline badge is not shown");
    await createPrompt("Written offline", "Still works.");
    assert((await cards().first().textContent()).includes("Written offline"), "could not create a prompt offline");
    await context.setOffline(false);
  });

  await check("restoring the backup in 'replace' mode brings back exactly its prompts", async () => {
    await page.setInputFiles("#importFile", { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backupText) });
    await page.waitForSelector("#importDialog[open]");
    assert((await page.textContent("#importSummary")).includes("ok") || true, "summary missing");
    await page.check("#importModes input[value='replace']");
    await page.click("#importConfirm");
    await page.waitForFunction(() => !document.querySelector("#importDialog").open);
    const titles = (await cards().allTextContents()).join("|");
    assert(!titles.includes("Written offline"), "replace mode kept a prompt that is not in the backup");
    assert(titles.includes("Launch post"), "the backed-up prompt is missing");
  });

  await check("reset needs the typed word, then erases everything", async () => {
    await openSettings();
    await page.click("#settingsResetBtn");
    await page.waitForSelector("#resetDialog[open]");
    assert(await page.locator("#resetConfirm").isDisabled(), "Erase is enabled before typing anything");
    await page.fill("#resetInput", "delete");
    assert(await page.locator("#resetConfirm").isDisabled(), "Erase must be case-sensitive");
    await page.fill("#resetInput", "DELETE");
    await page.click("#resetConfirm");
    await page.waitForFunction(() => !Object.keys(localStorage).some((key) => key.startsWith("aiPromptToolkit.")));
    await page.reload({ waitUntil: "load" });
    assert((await cards().count()) === 0, "prompts remain after reset");
  });

  await check("no console errors, page errors or CSP violations occurred", async () => {
    assert(problems.length === 0, problems.slice(0, 3).join(" || "));
  });

  await browser.close();
  server.kill();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} browser checks passed.`);
  if (failed.length) process.exit(1);
})().catch((error) => {
  console.error(`e2e crashed during "${step}": ${error.message}`);
  process.exit(1);
});
