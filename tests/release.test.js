/**
 * release.test.js — guards the things that are easy to break by hand when
 * shipping: version numbers, the offline file list, and the security rules
 * the docs promise.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const schema = require("../assets/js/core/schema.js");
const { readPrecache, readWorkerVersion } = require("../scripts/lib/precache.js");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const html = read("index.html");

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(relative));
    else out.push(relative);
  }
  return out;
}

/** Removes comments so a comment that *mentions* innerHTML does not count. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`])\/\/.*$/gm, "$1");
}

test("every place that shows the version agrees", () => {
  const pkg = JSON.parse(read("package.json")).version;
  const [major, minor] = pkg.split(".");

  assert.equal(schema.APP_VERSION, pkg, "schema.js APP_VERSION must equal package.json");
  assert.equal(readWorkerVersion(ROOT), pkg, "sw.js VERSION must equal package.json");
  assert.ok(
    html.includes(`<strong>v${major}.${minor}</strong>`),
    `the footer in index.html must show v${major}.${minor}`
  );
});

test("the current release is 3.2.0", () => {
  assert.equal(JSON.parse(read("package.json")).version, "3.2.0");
});

test("the service worker precaches every local file the page loads", () => {
  const precache = new Set(readPrecache(ROOT).map((entry) => entry.replace(/^\.\//, "")));
  const needed = new Set(["index.html"]);

  for (const match of html.matchAll(/(?:href|src)="(?!https?:|#|mailto:)([^"]+)"/g)) {
    const target = match[1].split("?")[0];
    if (target === "./") continue;
    needed.add(target);
  }

  for (const file of needed) {
    assert.ok(precache.has(file), `${file} is used by index.html but missing from PRECACHE in sw.js`);
  }
});

test("every precached file exists", () => {
  for (const entry of readPrecache(ROOT)) {
    if (entry === "./") continue;
    assert.ok(fs.existsSync(path.join(ROOT, entry)), `${entry} is listed in PRECACHE but does not exist`);
  }
});

test("every script and stylesheet in assets/ that the page can load is precached", () => {
  const precache = new Set(readPrecache(ROOT));
  const shipped = listFiles("assets").filter((file) => /\.(js|css)$/.test(file));
  for (const file of shipped) {
    assert.ok(precache.has(file), `${file} ships with the app but is not in PRECACHE, so it would fail offline`);
  }
});

test("application code never builds markup from strings or evaluates code", () => {
  const files = listFiles("assets/js").concat(["sw.js"]);
  const banned = [
    [/\binnerHTML\b/, "innerHTML"],
    [/\bouterHTML\b/, "outerHTML"],
    [/\binsertAdjacentHTML\b/, "insertAdjacentHTML"],
    [/\beval\s*\(/, "eval()"],
    [/\bnew\s+Function\b/, "new Function"],
    [/\bdocument\.write(ln)?\s*\(/, "document.write"],
    [/\bsetTimeout\s*\(\s*["'`]/, "setTimeout with a string"],
    [/\bsetInterval\s*\(\s*["'`]/, "setInterval with a string"],
  ];

  for (const file of files) {
    const code = stripComments(read(file));
    for (const [pattern, name] of banned) {
      assert.ok(!pattern.test(code), `${file} uses ${name}`);
    }
  }
});

test("only the storage layer touches localStorage", () => {
  for (const file of listFiles("assets/js")) {
    if (file.endsWith("core/storage.js")) continue;
    assert.ok(!/\blocalStorage\b/.test(stripComments(read(file))), `${file} must go through storage.js`);
  }
});

test("the Content Security Policy blocks inline code and foreign origins", () => {
  const match = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html);
  assert.ok(match, "index.html must declare a Content-Security-Policy");

  const policy = match[1];
  assert.ok(/default-src 'none'/.test(policy), "default-src must be 'none'");
  assert.ok(!/unsafe-inline|unsafe-eval/.test(policy), "no unsafe-inline or unsafe-eval");
  assert.ok(!/https?:|\*/.test(policy), "no remote origins or wildcards");
  assert.ok(/object-src 'none'/.test(policy));
  assert.ok(/base-uri 'self'/.test(policy));
});

test("the page loads nothing from another origin and has no inline code", () => {
  for (const match of html.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*\s(?:src|href)="(https?:[^"]+)"/g)) {
    assert.fail(`index.html loads ${match[1]} from another origin`);
  }
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), "no inline <script> blocks");
  assert.ok(!/<style[\s>]/.test(html), "no inline <style> blocks");
  assert.ok(!/\sstyle="/.test(html), "no inline style attributes");
  assert.ok(!/\son[a-z]+="/.test(html), "no inline event handlers");

  for (const file of listFiles("assets/css")) {
    assert.ok(!/@import|url\(\s*["']?https?:/.test(read(file)), `${file} loads a remote resource`);
  }
});

test("application code makes no network requests of its own", () => {
  for (const file of listFiles("assets/js")) {
    const code = stripComments(read(file));
    assert.ok(!/\bfetch\s*\(/.test(code), `${file} calls fetch()`);
    assert.ok(!/\bXMLHttpRequest\b/.test(code), `${file} uses XMLHttpRequest`);
    assert.ok(!/\bsendBeacon\b/.test(code), `${file} uses sendBeacon`);
    assert.ok(!/\bWebSocket\b/.test(code), `${file} uses WebSocket`);
    assert.ok(!/\bEventSource\b/.test(code), `${file} uses EventSource`);
  }
});

test("external links are opened safely", () => {
  for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    assert.ok(/rel="[^"]*noopener[^"]*"/.test(match[0]), `missing rel=noopener: ${match[0]}`);
  }
});

test("the manifest uses relative paths so it works under /ai-prompt-toolkit/", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith("/"), `${icon.src} must be relative`);
    assert.ok(fs.existsSync(path.join(ROOT, icon.src)), `${icon.src} must exist`);
  }
});
