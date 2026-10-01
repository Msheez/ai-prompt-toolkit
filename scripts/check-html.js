#!/usr/bin/env node
/**
 * check-html.js — a zero-dependency sanity check for a no-build project.
 *
 * Without a bundler nothing warns you about a typo in an element id or a
 * missing file, so CI runs these three checks on every push:
 *
 *   1. every file referenced by index.html actually exists
 *   2. every <use href="#icon"> points at a symbol defined in the sprite
 *   3. every document.getElementById("x") in the JS matches an id in the HTML
 *
 * Run it with: npm run check
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const problems = [];
const checks = [];

function report(name, failures) {
  checks.push({ name, failures: failures.length });
  for (const failure of failures) problems.push(`${name}: ${failure}`);
}

/* 1. Referenced files exist ------------------------------------------------ */
const referenced = [];
const attribute = /(?:href|src)="(?!https?:|#|mailto:|\.\/")([^"]+)"/g;
let match;
while ((match = attribute.exec(html)) !== null) {
  const target = match[1].split("?")[0];
  if (target.startsWith("http") || target.startsWith("#") || target === "./") continue;
  referenced.push(target);
}
report(
  "referenced files",
  referenced.filter((file) => !fs.existsSync(path.join(ROOT, file))).map((file) => `${file} is missing`)
);

/* 2. Icon sprite ----------------------------------------------------------- */
const symbols = new Set(Array.from(html.matchAll(/<symbol id="([^"]+)"/g), (entry) => entry[1]));
const usedIcons = new Set(Array.from(html.matchAll(/<use href="#([^"]+)"/g), (entry) => entry[1]));

const jsDir = path.join(ROOT, "assets", "js");
const jsFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js")) jsFiles.push(full);
  }
})(jsDir);

const js = jsFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
for (const entry of js.matchAll(/icon\("(i-[a-z-]+)"/g)) usedIcons.add(entry[1]);

report(
  "icon sprite",
  Array.from(usedIcons)
    .filter((name) => !symbols.has(name))
    .map((name) => `#${name} is used but not defined`)
);

/* 3. Element ids ----------------------------------------------------------- */
const ids = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g), (entry) => entry[1]));
const lookedUp = new Set(Array.from(js.matchAll(/\$\("([^"]+)"\)/g), (entry) => entry[1]));
for (const entry of js.matchAll(/getElementById\("([^"]+)"\)/g)) lookedUp.add(entry[1]);

report(
  "element ids",
  Array.from(lookedUp)
    .filter((id) => !ids.has(id))
    .map((id) => `#${id} is read by the JS but is not in index.html`)
);

/* Result ------------------------------------------------------------------- */
for (const check of checks) {
  console.log(`${check.failures ? "FAIL" : "ok  "}  ${check.name}`);
}

if (problems.length) {
  console.error("\n" + problems.map((problem) => `  - ${problem}`).join("\n") + "\n");
  process.exit(1);
}

console.log(`\nAll checks passed (${referenced.length} files, ${symbols.size} icons, ${lookedUp.size} ids).`);
