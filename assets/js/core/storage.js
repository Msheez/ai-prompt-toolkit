/**
 * storage.js — persistence (localStorage) with a safety net.
 *
 * The storage backend is injected, so tests can pass a fake and the app stays
 * usable (in memory) when localStorage is unavailable, e.g. in private mode
 * or inside a sandboxed iframe.
 *
 * It also migrates v1 data: prompts saved by the original release under
 * `aiPromptToolkit.prompts.v1` are upgraded to the v2 schema on first load.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./schema.js"));
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.storage = factory(global.PromptToolkit.schema);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (schema) {
  "use strict";

  const KEYS = {
    library: "aiPromptToolkit.library.v2",
    settings: "aiPromptToolkit.settings.v2",
    legacy: "aiPromptToolkit.prompts.v1",
  };

  const DEFAULT_SETTINGS = {
    theme: "dark",
    sort: "updated",
    onboarded: false,
  };

  /** Used when localStorage throws (private mode, disabled cookies, quota). */
  function memoryBackend() {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    };
  }

  function safeBackend(candidate) {
    try {
      const probe = "__apt_probe__";
      candidate.setItem(probe, "1");
      candidate.removeItem(probe);
      return { backend: candidate, persistent: true };
    } catch (error) {
      return { backend: memoryBackend(), persistent: false };
    }
  }

  function createStorage(options) {
    const config = options || {};
    const requested =
      config.backend || (typeof localStorage !== "undefined" ? localStorage : memoryBackend());
    const resolved = safeBackend(requested);
    const backend = resolved.backend;

    function readJson(key) {
      try {
        const raw = backend.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    }

    function writeJson(key, value) {
      try {
        backend.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    }

    /**
     * Loads the library, upgrading v1 data when needed.
     * @returns {{prompts: Array, migrated: boolean}}
     */
    function loadPrompts() {
      const current = readJson(KEYS.library);
      if (current && Array.isArray(current.prompts)) {
        return { prompts: schema.normalizeAll(current.prompts), migrated: false };
      }

      const legacy = readJson(KEYS.legacy);
      if (Array.isArray(legacy) && legacy.length) {
        const prompts = schema.normalizeAll(legacy);
        savePrompts(prompts);
        return { prompts, migrated: true };
      }

      return { prompts: [], migrated: false };
    }

    function savePrompts(prompts) {
      return writeJson(KEYS.library, {
        app: schema.APP_NAME,
        schemaVersion: schema.SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        prompts: schema.normalizeAll(prompts),
      });
    }

    function hasSettings() {
      return readJson(KEYS.settings) !== null;
    }

    function loadSettings() {
      const stored = readJson(KEYS.settings);
      return Object.assign({}, DEFAULT_SETTINGS, stored && typeof stored === "object" ? stored : {});
    }

    function saveSettings(settings) {
      return writeJson(KEYS.settings, Object.assign({}, DEFAULT_SETTINGS, settings || {}));
    }

    function clear() {
      backend.removeItem(KEYS.library);
      backend.removeItem(KEYS.settings);
    }

    return {
      KEYS,
      clear,
      hasSettings,
      isPersistent: resolved.persistent,
      loadPrompts,
      loadSettings,
      savePrompts,
      saveSettings,
    };
  }

  return { DEFAULT_SETTINGS, KEYS, createStorage, memoryBackend };
});
