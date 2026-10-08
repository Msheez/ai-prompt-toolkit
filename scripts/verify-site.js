#!/usr/bin/env node
/**
 * verify-site.js — starts the static server and requests every file the app
 * needs, exactly as a browser would. Fails if anything is missing or served
 * with the wrong type.
 *
 *   node scripts/verify-site.js          # checks the repository root
 *   SERVE_DIR=dist node scripts/verify-site.js   # checks the built site
 */
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { readPrecache } = require("./lib/precache.js");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.resolve(ROOT, process.env.SERVE_DIR || ".");
const PORT = Number(process.env.PORT) || 8123;

const EXPECTED_TYPE = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "javascript",
  ".webmanifest": "manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: urlPath }, (response) => {
        response.resume();
        response.on("end", () => resolve({ status: response.statusCode, type: response.headers["content-type"] || "" }));
      })
      .on("error", reject);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await get("/");
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error("The server did not start");
}

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, "scripts", "serve.js")], {
    env: Object.assign({}, process.env, { PORT: String(PORT), HOST: "127.0.0.1", SERVE_DIR: DIR }),
    stdio: "ignore",
  });

  const failures = [];
  try {
    await waitForServer();
    const paths = ["/", "/sw.js"].concat(readPrecache(DIR).filter((entry) => entry !== "./").map((entry) => "/" + entry));
    for (const urlPath of Array.from(new Set(paths))) {
      const { status, type } = await get(urlPath);
      const extension = path.extname(urlPath) || ".html";
      const expected = EXPECTED_TYPE[extension];
      const ok = status === 200 && (!expected || type.includes(expected));
      console.log(`${ok ? "ok  " : "FAIL"}  ${status}  ${urlPath}`);
      if (!ok) failures.push(`${urlPath} -> ${status} ${type}`);
    }
    const missing = await get("/definitely-not-here.js");
    if (missing.status !== 404) failures.push("a missing file should return 404");
  } finally {
    server.kill();
  }

  if (failures.length) {
    console.error("\nSite verification failed:\n" + failures.map((failure) => `  - ${failure}`).join("\n"));
    process.exit(1);
  }
  console.log("\nSite verification passed.");
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
