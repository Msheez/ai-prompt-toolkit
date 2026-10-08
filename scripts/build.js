#!/usr/bin/env node
/**
 * build.js — assembles the deployable site into ./dist.
 *
 * The app has no bundler: the files in the repository ARE the app. "Building"
 * therefore means copying only what the browser needs (and nothing else —
 * no tests, docs or scripts) and then proving the copy is complete:
 *
 *   - every file the service worker precaches exists in dist/
 *   - every local file index.html refers to exists in dist/
 *
 * If either check fails the build fails, and so does the deployment.
 *
 *   npm run build
 */
const fs = require("node:fs");
const path = require("node:path");
const { readPrecache } = require("./lib/precache.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist");

const FILES = ["index.html", "sw.js", "manifest.webmanifest", ".nojekyll"];
const DIRECTORIES = ["assets"];

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirectory(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const file of FILES) {
  const source = path.join(ROOT, file);
  if (!fs.existsSync(source)) throw new Error(`Missing required file: ${file}`);
  fs.copyFileSync(source, path.join(OUT, file));
}
for (const directory of DIRECTORIES) copyDirectory(path.join(ROOT, directory), path.join(OUT, directory));

const problems = [];
for (const entry of readPrecache(OUT)) {
  if (entry === "./") continue;
  if (!fs.existsSync(path.join(OUT, entry))) problems.push(`sw.js precaches "${entry}" but it is not in dist/`);
}

const html = fs.readFileSync(path.join(OUT, "index.html"), "utf8");
for (const match of html.matchAll(/(?:href|src)="(?!https?:|#|mailto:)([^"]+)"/g)) {
  const target = match[1].split("?")[0];
  if (target === "./") continue;
  if (!fs.existsSync(path.join(OUT, target))) problems.push(`index.html refers to "${target}" but it is not in dist/`);
}

if (problems.length) {
  console.error("Build failed:\n" + problems.map((problem) => `  - ${problem}`).join("\n"));
  process.exit(1);
}

let files = 0;
let bytes = 0;
(function count(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) count(full);
    else {
      files += 1;
      bytes += fs.statSync(full).size;
    }
  }
})(OUT);

console.log(`Built dist/ — ${files} files, ${(bytes / 1024).toFixed(1)} KB.`);
