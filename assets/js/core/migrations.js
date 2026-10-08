/**
 * migrations.js — upgrades data from any earlier format to the current one.
 *
 * Data can arrive from three places: this browser's storage, an exported
 * JSON file, or a full backup file. All three are described by a
 * `schemaVersion`. This module turns whatever it receives into one
 * "document" and then walks it up the ladder one step at a time:
 *
 *   1  original release: a bare array of prompts, tags as a string
 *   2  { prompts: [...] } envelope, tags array, favourites, usage counts
 *   3  prompts carry a `version` number; version history lives beside them
 *
 * Adding schema version 4 later means: bump SCHEMA_VERSION in schema.js, add
 * STEPS[3] below, and add a test. Nothing else in the app needs to know.
 *
 * Migration never deletes the source. Callers keep the original data until
 * the user decides to remove it, and data from a *newer* version is refused
 * with an explanation instead of being "migrated" (which would lose fields).
 *
 * Pure and DOM-free.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./schema.js"), require("./history.js"), require("./security.js"));
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.migrations = factory(
      global.PromptToolkit.schema,
      global.PromptToolkit.history,
      global.PromptToolkit.security
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (schema, history, security) {
  "use strict";

  const CURRENT = schema.SCHEMA_VERSION;

  function versionOf(envelope) {
    const value = Number.parseInt(envelope && envelope.schemaVersion, 10);
    return Number.isFinite(value) && value >= 1 ? value : 1;
  }

  /**
   * Reads the many file shapes we have ever produced into one document:
   * { schemaVersion, prompts, versions, settings, meta }.
   * Returns null when the input has no prompt list at all.
   */
  function toDocument(input) {
    if (Array.isArray(input)) return { schemaVersion: 1, prompts: input, meta: {} };
    if (!security.isPlainObject(input)) return null;

    const meta = {
      app: typeof input.app === "string" ? input.app.slice(0, 60) : "",
      kind: typeof input.kind === "string" ? input.kind.slice(0, 20) : "",
      appVersion: typeof input.appVersion === "string" ? input.appVersion.slice(0, 20) : "",
      createdAt: typeof input.createdAt === "string" ? input.createdAt : input.exportedAt || input.savedAt || "",
      checksum: typeof input.checksum === "string" ? input.checksum : "",
    };

    // Full backup: the payload sits under `data`.
    if (security.isPlainObject(input.data) && Array.isArray(input.data.prompts)) {
      return {
        schemaVersion: versionOf(input),
        prompts: input.data.prompts,
        versions: input.data.versions,
        settings: input.data.settings,
        payload: input.data,
        meta,
      };
    }

    if (Array.isArray(input.prompts)) {
      return {
        schemaVersion: versionOf(input),
        prompts: input.prompts,
        versions: input.versions,
        meta,
      };
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * The ladder. Each step takes a document and returns the next one.
   * ------------------------------------------------------------------ */

  function legacyPrompt(raw) {
    return {
      id: raw.id,
      title: raw.title,
      category: raw.category,
      tags: raw.tags, // a string in v1; normalised to an array later
      content: raw.content,
      notes: raw.notes,
      favorite: Boolean(raw.favorite || raw.starred),
      usageCount: raw.usageCount,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  const STEPS = {
    1: {
      label: "1 → 2",
      run(doc) {
        const prompts = doc.prompts.filter(security.isPlainObject).map(legacyPrompt);
        return Object.assign({}, doc, { schemaVersion: 2, prompts });
      },
    },
    2: {
      label: "2 → 3",
      run(doc) {
        const prompts = doc.prompts.map((raw) => Object.assign({}, raw, { version: raw.version || 1 }));
        return Object.assign({}, doc, { schemaVersion: 3, prompts, versions: doc.versions || {} });
      },
    },
  };

  /**
   * Walks a document up to the current schema.
   * @returns {{ok: true, from: number, to: number, steps: string[], document: object}
   *         | {ok: false, code: string, message: string, from?: number}}
   */
  function migrate(input) {
    const doc = toDocument(input);
    if (!doc) {
      return { ok: false, code: "unreadable", message: "No prompts were found in that data." };
    }

    const from = doc.schemaVersion;
    if (from > CURRENT) {
      return {
        ok: false,
        code: "newer",
        from,
        message:
          `This data was saved by a newer version of AI Prompt Toolkit (data format ${from}; ` +
          `this version understands up to ${CURRENT}). Update the app or open it with the newer version — ` +
          "nothing has been changed.",
      };
    }

    let current = doc;
    const steps = [];
    for (let version = from; version < CURRENT; version += 1) {
      const step = STEPS[version];
      if (!step) {
        return { ok: false, code: "unreadable", from, message: `There is no upgrade path from data format ${version}.` };
      }
      current = step.run(current);
      steps.push(step.label);
    }
    return { ok: true, from, to: CURRENT, steps, document: current };
  }

  /**
   * Migrates *and* validates: the result is safe to put straight into the app.
   * @returns {{ok: true, prompts, versions, settings, from, to, steps, meta, warnings: string[]}
   *         | {ok: false, code: string, message: string}}
   */
  function load(input) {
    const result = migrate(input);
    if (!result.ok) return result;

    const doc = result.document;
    if (doc.prompts.length > security.LIMITS.maxPrompts) {
      return {
        ok: false,
        code: "too-many",
        message: `That file contains ${doc.prompts.length} prompts; the limit for one import is ${security.LIMITS.maxPrompts}.`,
      };
    }

    const warnings = [];
    const prompts = schema.normalizeAll(doc.prompts);
    const skipped = doc.prompts.length - prompts.length;
    if (skipped > 0) {
      warnings.push(`${skipped} ${skipped === 1 ? "entry" : "entries"} with no title and no text ${skipped === 1 ? "was" : "were"} skipped.`);
    }

    const cleaned = history.sanitizeVersions(doc.versions);
    const pruned = history.pruneOrphans(cleaned.versions, prompts);
    const lostHistory = cleaned.dropped;
    if (lostHistory > 0) {
      warnings.push(`${lostHistory} damaged or surplus history ${lostHistory === 1 ? "entry was" : "entries were"} skipped.`);
    }

    const versions = pruned.versions;
    return {
      ok: true,
      prompts: history.syncVersionNumbers(prompts, versions),
      versions,
      settings: security.isPlainObject(doc.settings) ? doc.settings : null,
      from: result.from,
      to: result.to,
      steps: result.steps,
      meta: doc.meta || {},
      payload: doc.payload || null,
      warnings,
    };
  }

  return { CURRENT, STEPS, load, migrate, toDocument, versionOf };
});
