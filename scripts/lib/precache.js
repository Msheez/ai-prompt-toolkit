/**
 * Reads the PRECACHE list out of sw.js without executing the worker.
 * Shared by the build script, the site verifier and the tests so there is
 * exactly one definition of "the files the app needs".
 */
const fs = require("node:fs");
const path = require("node:path");

function readPrecache(root) {
  const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const match = /const PRECACHE = \[([\s\S]*?)\];/.exec(source);
  if (!match) throw new Error("Could not find the PRECACHE list in sw.js");
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (entry) => entry[1]);
}

function readWorkerVersion(root) {
  const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const match = /const VERSION = "([^"]+)"/.exec(source);
  if (!match) throw new Error("Could not find VERSION in sw.js");
  return match[1];
}

module.exports = { readPrecache, readWorkerVersion };
