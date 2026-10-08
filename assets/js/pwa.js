/**
 * pwa.js — registers the service worker and reports what happens.
 *
 * Kept out of app.js on purpose: it has no knowledge of prompts, and the app
 * works exactly the same when it is unsupported or fails.
 *
 * Callbacks passed to register():
 *   onUpdate(apply)  a new version is waiting; call apply() to switch to it
 *   onOfflineReady() the app has been cached and will open without a connection
 *
 * The page reloads only after the user chose to update. A first-ever install
 * does not reload anything.
 */
(function (global, factory) {
  global.PromptToolkit = global.PromptToolkit || {};
  global.PromptToolkit.pwa = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RECHECK_MS = 60 * 60 * 1000;

  function supported() {
    if (!("serviceWorker" in navigator)) return false;
    const host = location.hostname;
    return location.protocol === "https:" || host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  }

  function register(callbacks) {
    const handlers = callbacks || {};
    if (!supported()) return Promise.resolve({ supported: false });

    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    let lastCheck = Date.now();

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Reload only when an existing version was replaced, never on the first install.
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });

    function announceUpdate(registration) {
      if (typeof handlers.onUpdate !== "function") return;
      handlers.onUpdate(() => {
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      });
    }

    return navigator.serviceWorker
      .register("sw.js", { scope: "./", updateViaCache: "none" })
      .then((registration) => {
        if (registration.waiting && hadController) announceUpdate(registration);

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state !== "installed") return;
            if (navigator.serviceWorker.controller) announceUpdate(registration);
            else if (typeof handlers.onOfflineReady === "function") handlers.onOfflineReady();
          });
        });

        // No polling: look for a new version when the tab becomes visible again, at most hourly.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible" || Date.now() - lastCheck < RECHECK_MS) return;
          lastCheck = Date.now();
          registration.update().catch(() => {});
        });

        return { supported: true, registration };
      })
      .catch((error) => {
        if (typeof handlers.onError === "function") handlers.onError(error);
        return { supported: true, error };
      });
  }

  /** Name of the cache this version of the app uses, e.g. "ai-prompt-toolkit-3.2.0". */
  function cacheNames() {
    if (typeof caches === "undefined") return Promise.resolve([]);
    return caches.keys().then((names) => names.filter((name) => name.startsWith("ai-prompt-toolkit-")));
  }

  return { cacheNames, register, supported };
});
