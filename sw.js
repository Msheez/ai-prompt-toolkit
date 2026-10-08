/**
 * sw.js — offline support for AI Prompt Toolkit.
 *
 * Strategy, in plain words:
 *   - On install, every file the app needs is downloaded into a cache whose
 *     name contains the app version, so the app opens with no connection.
 *   - On every request the network is tried first (revalidating with the
 *     server, so a new deployment is never hidden behind a stale copy). If the
 *     network fails or takes longer than four seconds, the cached copy is used.
 *   - A new version installs in the background and then WAITS. The page shows
 *     "Update available"; nothing changes under the user until they click it.
 *   - When the new version takes over, caches from older versions are deleted.
 *
 * It only ever handles same-origin GET requests, and it never sends or stores
 * anything the page did not already request. Prompts are not in the cache:
 * they live in the browser's own storage and are not touched by this file.
 *
 * VERSION must match package.json, schema.js and the footer. `npm test`
 * enforces this, and also checks that PRECACHE lists every file the page uses.
 */
"use strict";

const VERSION = "3.2.0";
const CACHE_PREFIX = "ai-prompt-toolkit-";
const CACHE = CACHE_PREFIX + VERSION;
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/css/tokens.css",
  "assets/css/base.css",
  "assets/css/components.css",
  "assets/css/layout.css",
  "assets/js/core/security.js",
  "assets/js/core/schema.js",
  "assets/js/core/search.js",
  "assets/js/core/variables.js",
  "assets/js/core/history.js",
  "assets/js/core/library.js",
  "assets/js/core/migrations.js",
  "assets/js/core/backup.js",
  "assets/js/core/health.js",
  "assets/js/core/storage.js",
  "assets/js/core/starter-prompts.js",
  "assets/js/pwa.js",
  "assets/js/app.js",
  "assets/img/favicon.svg",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png",
  "assets/img/icon-maskable-512.png",
  "assets/img/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // `reload` skips the browser's HTTP cache so a fresh install never stores stale files.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
  );
  // Deliberately no skipWaiting(): the page decides when to switch (see message handler).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function fetchFresh(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS);
    fetch(request.url, { cache: "no-cache", credentials: "same-origin" }).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetchFresh(request);
    if (response.status === 200 && response.type === "basic") {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = (await cache.match(request, { ignoreSearch: true })) || null;
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await cache.match("index.html");
      if (shell) return shell;
    }
    return new Response("You are offline and this file has not been saved yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
