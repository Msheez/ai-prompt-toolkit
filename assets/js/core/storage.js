/**
 * storage.js — persistence (localStorage) with a safety net.
 *
 * The storage backend is injected, so tests can pass a fake and the app stays
 * usable (in memory) when localStorage is unavailable, e.g. in private mode
 * or inside a sandboxed iframe.
 *
 * Layout (all keys are written by this module only):
 *
 *   library.v3    the prompts                      small, rewritten on every save
 *   versions.v3   the version history              larger, rewritten only when it changes
 *   settings.v2   theme, sort, onboarding flags
 *   safety.v3     one "undo" copy taken before a risky import
 *   quarantine.v3 damaged data the user chose to set aside
 *   library.v2    ┐ older formats, read once and then left alone —
 *   prompts.v1    ┘ migration never deletes the source
 *
 * Safety rules:
 *   - If the stored library is damaged, or was written by a *newer* version of
 *     the app, saving is locked instead of overwriting it with an empty
 *     library. The data stays where it is until the user decides what to do.
 *   - Version history is secondary data: when the browser quota is tight it is
 *     trimmed first so that prompts can always be saved.
 *
 * localStorage holds roughly 5 MB per origin. IndexedDB is the planned next
 * step (see docs/ROADMAP.md); nothing in this file is exposed to the UI in a
 * way that would block that change.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./schema.js"),
      require("./history.js"),
      require("./migrations.js"),
      require("./security.js")
    );
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.storage = factory(
      global.PromptToolkit.schema,
      global.PromptToolkit.history,
      global.PromptToolkit.migrations,
      global.PromptToolkit.security
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (schema, history, migrations, security) {
  "use strict";

  const KEYS = {
    library: "aiPromptToolkit.library.v3",
    versions: "aiPromptToolkit.versions.v3",
    safety: "aiPromptToolkit.safety.v3",
    quarantine: "aiPromptToolkit.quarantine.v3",
    settings: "aiPromptToolkit.settings.v2",
    legacyV2: "aiPromptToolkit.library.v2",
    legacy: "aiPromptToolkit.prompts.v1",
  };

  const DEFAULT_SETTINGS = {
    theme: "system", // "system" | "light" | "dark"
    sort: "updated",
    onboarded: false,
    trackUsage: true,
    lastBackupAt: "",
  };

  /** localStorage is capped far below this, so it only guards against absurd input. */
  const MAX_STORED_BYTES = 25 * 1024 * 1024;

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

    /** Set when stored data must not be overwritten. See loadLibrary(). */
    let problem = null;

    /* -------------------------------------------------------------- *
     * Low-level helpers
     * -------------------------------------------------------------- */

    function readRaw(key) {
      try {
        return backend.getItem(key);
      } catch (error) {
        return null;
      }
    }

    function readJson(key) {
      const raw = readRaw(key);
      if (!raw) return null;
      try {
        return security.safeParseJson(raw, { maxBytes: MAX_STORED_BYTES }).data;
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

    function remove(key) {
      try {
        backend.removeItem(key);
      } catch (error) {
        /* nothing to do */
      }
    }

    function sizeOf(key) {
      const raw = readRaw(key);
      return raw ? raw.length : 0;
    }

    /* -------------------------------------------------------------- *
     * Prompts
     * -------------------------------------------------------------- */

    function describeProblem(key, loaded) {
      return {
        key,
        code: loaded.code || "unreadable",
        message:
          loaded.code === "newer"
            ? loaded.message
            : "The saved library in this browser could not be read, so saving has been paused to protect it.",
      };
    }

    /** Parses a stored value and runs it through the migration ladder. */
    function readLibraryKey(key) {
      const raw = readRaw(key);
      if (raw === null) return null;
      try {
        const parsed = security.safeParseJson(raw, { maxBytes: MAX_STORED_BYTES }).data;
        return migrations.load(parsed);
      } catch (error) {
        return { ok: false, code: "corrupt", message: error.message };
      }
    }

    function loadStoredVersions(prompts, warnings) {
      const raw = readRaw(KEYS.versions);
      if (raw === null) return {};
      try {
        const parsed = security.safeParseJson(raw, { maxBytes: MAX_STORED_BYTES }).data;
        const cleaned = history.sanitizeVersions(parsed);
        return history.pruneOrphans(cleaned.versions, prompts).versions;
      } catch (error) {
        // Keep the unreadable text so it is not lost when history is saved again.
        if (readRaw(KEYS.quarantine) === null) {
          writeJson(KEYS.quarantine, { savedAt: new Date().toISOString(), key: KEYS.versions, code: "corrupt", raw });
        }
        warnings.push("The version history in this browser could not be read, so it was reset. The damaged copy was set aside.");
        return {};
      }
    }

    /**
     * Loads the library, upgrading older data when needed.
     *
     * @returns {{prompts: Array, versions: object,
     *            migrated: null | {from: number, to: number, count: number},
     *            problem: null | {key: string, code: string, message: string},
     *            warnings: string[]}}
     */
    function loadLibrary() {
      const outcome = { prompts: [], versions: {}, migrated: null, problem: null, warnings: [] };
      problem = null;

      const current = readLibraryKey(KEYS.library);
      if (current) {
        if (current.ok) {
          outcome.prompts = current.prompts;
          outcome.versions = loadStoredVersions(current.prompts, outcome.warnings);
          outcome.prompts = history.syncVersionNumbers(outcome.prompts, outcome.versions);
          outcome.warnings.push(...current.warnings);
          return outcome;
        }
        problem = describeProblem(KEYS.library, current);
        outcome.problem = problem;
        return outcome;
      }

      for (const key of [KEYS.legacyV2, KEYS.legacy]) {
        const legacy = readLibraryKey(key);
        if (!legacy) continue;

        if (!legacy.ok) {
          problem = describeProblem(key, legacy);
          outcome.problem = problem;
          return outcome;
        }
        if (!legacy.prompts.length) continue;

        outcome.prompts = legacy.prompts;
        outcome.warnings.push(...legacy.warnings);
        outcome.migrated = { from: legacy.from, to: legacy.to, count: legacy.prompts.length };
        savePrompts(outcome.prompts); // the source key is left untouched
        return outcome;
      }

      return outcome;
    }

    /** Backwards-compatible wrapper used by older callers and tests. */
    function loadPrompts() {
      const loaded = loadLibrary();
      return { prompts: loaded.prompts, migrated: Boolean(loaded.migrated) };
    }

    function writeLibrary(prompts) {
      return writeJson(KEYS.library, {
        app: schema.APP_NAME,
        schemaVersion: schema.SCHEMA_VERSION,
        appVersion: schema.APP_VERSION,
        savedAt: new Date().toISOString(),
        prompts: schema.normalizeAll(prompts),
      });
    }

    /** Frees space for prompts by halving the stored version history. */
    function makeRoom() {
      const stored = readJson(KEYS.versions);
      if (!stored) return false;
      const versions = history.sanitizeVersions(stored).versions;
      const half = Math.floor(history.totalChars(versions) / 2);
      const trimmed = history.enforceBudget(versions, half);
      if (!trimmed.dropped) return false;
      return writeJson(KEYS.versions, trimmed.versions);
    }

    function savePrompts(prompts) {
      if (problem) return false;
      if (writeLibrary(prompts)) return true;
      return makeRoom() && writeLibrary(prompts);
    }

    /* -------------------------------------------------------------- *
     * Version history
     * -------------------------------------------------------------- */

    /**
     * Saves the version map, trimming the oldest entries if the browser's
     * quota is tight. Returns the map that was actually stored so the caller
     * can keep its in-memory copy identical.
     *
     * @returns {{ok: boolean, trimmed: boolean, versions: object}}
     */
    function saveVersions(map) {
      const input = map || {};
      if (problem) return { ok: false, trimmed: false, versions: input };

      const budgeted = history.enforceBudget(input);
      let working = budgeted.versions;
      let trimmed = budgeted.dropped > 0;
      if (writeJson(KEYS.versions, working)) return { ok: true, trimmed, versions: working };

      for (const factor of [0.5, 0.25]) {
        working = history.enforceBudget(working, Math.floor(history.totalChars(working) * factor)).versions;
        trimmed = true;
        if (writeJson(KEYS.versions, working)) return { ok: true, trimmed, versions: working };
      }
      return { ok: false, trimmed, versions: working };
    }

    /* -------------------------------------------------------------- *
     * Settings
     * -------------------------------------------------------------- */

    function hasSettings() {
      return readJson(KEYS.settings) !== null;
    }

    function loadSettings() {
      const stored = readJson(KEYS.settings);
      return Object.assign({}, DEFAULT_SETTINGS, security.isPlainObject(stored) ? stored : {});
    }

    function saveSettings(settings) {
      return writeJson(KEYS.settings, Object.assign({}, DEFAULT_SETTINGS, settings || {}));
    }

    /* -------------------------------------------------------------- *
     * Safety copy (one slot, taken before a risky import)
     * -------------------------------------------------------------- */

    function saveSafety(snapshot, reason) {
      return writeJson(KEYS.safety, {
        app: schema.APP_NAME,
        kind: "safety",
        schemaVersion: schema.SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        reason: String(reason || "import").slice(0, 40),
        prompts: schema.normalizeAll(snapshot && snapshot.prompts),
        versions: (snapshot && snapshot.versions) || {},
      });
    }

    /** @returns {null | {savedAt: string, reason: string, prompts: Array, versions: object}} */
    function loadSafety() {
      const stored = readJson(KEYS.safety);
      if (!security.isPlainObject(stored) || !Array.isArray(stored.prompts)) return null;
      const prompts = schema.normalizeAll(stored.prompts);
      const versions = history.pruneOrphans(history.sanitizeVersions(stored.versions).versions, prompts).versions;
      return {
        savedAt: typeof stored.savedAt === "string" ? stored.savedAt : "",
        reason: typeof stored.reason === "string" ? stored.reason : "import",
        prompts,
        versions,
      };
    }

    function clearSafety() {
      remove(KEYS.safety);
    }

    /* -------------------------------------------------------------- *
     * Recovery
     * -------------------------------------------------------------- */

    function isLocked() {
      return Boolean(problem);
    }

    function getProblem() {
      return problem;
    }

    /** The unreadable text itself, so the user can download it. */
    function readProblemRaw() {
      return problem ? readRaw(problem.key) : null;
    }

    /**
     * "Start fresh" after a problem: the damaged text is copied to the
     * quarantine slot and then removed from its original key, which unlocks
     * saving. If there is no room to keep a copy, nothing happens unless the
     * caller passes { discard: true }.
     *
     * @returns {{ok: boolean, reason?: "quota"}}
     */
    function resolveProblem(options) {
      if (!problem) return { ok: true };
      const raw = readRaw(problem.key);
      if (raw !== null) {
        const kept = writeJson(KEYS.quarantine, {
          savedAt: new Date().toISOString(),
          key: problem.key,
          code: problem.code,
          raw,
        });
        if (!kept && !(options && options.discard)) return { ok: false, reason: "quota" };
        remove(problem.key);
      }
      problem = null;
      return { ok: true };
    }

    function readQuarantine() {
      const stored = readJson(KEYS.quarantine);
      return security.isPlainObject(stored) && typeof stored.raw === "string" ? stored : null;
    }

    function clearQuarantine() {
      remove(KEYS.quarantine);
    }

    /* -------------------------------------------------------------- *
     * Housekeeping
     * -------------------------------------------------------------- */

    /**
     * The stored library exactly as it is on disk (before normalising). Used
     * only by the health check, which has to see problems that loading hides.
     */
    function readStored() {
      const library = readJson(KEYS.library);
      const versions = readJson(KEYS.versions);
      return {
        rawPrompts: library && Array.isArray(library.prompts) ? library.prompts : [],
        rawVersions: security.isPlainObject(versions) ? versions : {},
      };
    }

    /** Characters stored per area (roughly 2 bytes each in most browsers). */
    function usage() {
      const out = {
        library: sizeOf(KEYS.library),
        versions: sizeOf(KEYS.versions),
        safety: sizeOf(KEYS.safety),
        quarantine: sizeOf(KEYS.quarantine),
        legacy: sizeOf(KEYS.legacyV2) + sizeOf(KEYS.legacy),
      };
      out.total = out.library + out.versions + out.safety + out.quarantine + out.legacy;
      return out;
    }

    /** Removes the old v1/v2 copies that migration deliberately left behind. */
    function dropLegacy() {
      remove(KEYS.legacyV2);
      remove(KEYS.legacy);
    }

    /**
     * Removes everything this app ever stored in the browser — including the
     * safety copy and the old formats, so nothing can come back.
     */
    function clear() {
      for (const key of Object.values(KEYS)) remove(key);
      problem = null;
    }

    return {
      KEYS,
      clear,
      clearQuarantine,
      clearSafety,
      dropLegacy,
      getProblem,
      hasSettings,
      isLocked,
      isPersistent: resolved.persistent,
      loadLibrary,
      loadPrompts,
      loadSafety,
      loadSettings,
      readProblemRaw,
      readQuarantine,
      readStored,
      resolveProblem,
      saveSafety,
      savePrompts,
      saveSettings,
      saveVersions,
      usage,
    };
  }

  return { DEFAULT_SETTINGS, KEYS, createStorage, memoryBackend };
});
