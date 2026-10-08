#!/usr/bin/env node
/**
 * A tiny static file server for local development — no dependencies.
 *
 *   npm start            -> http://localhost:8000
 *   PORT=3000 npm start  -> http://localhost:3000
 *
 * The app is plain HTML/CSS/JS, so this only exists to avoid the browser's
 * file:// restrictions and to mirror how GitHub Pages serves the site.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// SERVE_DIR lets CI serve the built site (dist/) instead of the repository root.
const ROOT = process.env.SERVE_DIR
  ? path.resolve(process.env.SERVE_DIR)
  : path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requested = decodeURIComponent(url.pathname);
  const relative = requested.endsWith("/") ? path.join(requested, "index.html") : requested;
  const filePath = path.join(ROOT, path.normalize(relative));

  // Never serve anything outside the project folder.
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<h1>404</h1><p>Not found. Try <a href=\"/\">the home page</a>.</p>");
      return;
    }
    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      // The same protections the meta tag in index.html asks for, plus ones a meta tag cannot set.
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    response.end(content);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`AI Prompt Toolkit running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop.");
});
