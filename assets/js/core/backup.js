/**
 * backup.js — full backups, safe imports and the five import modes.
 *
 * Two kinds of file exist:
 *
 *   export  prompts only          (what "Export as JSON" has always written)
 *   backup  prompts + version history + a few settings, plus a checksum
 *
 * `inspect()` never changes anything. It parses and validates a file and
 * returns a preview — counts, warnings, errors — so the user can see what
 * will happen before they confirm. `plan()` then computes the resulting
 * library for a chosen import mode, again without touching storage; the app
 * decides when to save it.
 *
 * About the checksum: it is a 32-bit FNV-1a hash of the backup payload. It
 * catches accidental damage and hand edits. It is NOT a signature and does
 * not stop someone from deliberately crafting a file — which is why every
 * file is validated and sanitised regardless.
 *
 * Pure and DOM-free.
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
    global.PromptToolkit.backup = factory(
      global.PromptToolkit.schema,
      global.PromptToolkit.history,
      global.PromptToolkit.migrations,
      global.PromptToolkit.security
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (schema, history, migrations, security) {
  "use strict";

  /** What the import dialog offers. Keys are the mode ids used by plan(). */
  const MODES = {
    merge: {
      label: "Merge",
      help: "Keep everything you have. Prompts that exist in both are replaced only when the file's copy is newer.",
    },
    skip: {
      label: "Add new only",
      help: "Add prompts you do not have yet and leave every existing prompt exactly as it is.",
    },
    update: {
      label: "Update existing only",
      help: "Overwrite prompts that exist in both with the file's copy. Prompts that are only in the file are ignored.",
    },
    new: {
      label: "Import as new copies",
      help: "Add every prompt in the file as a brand-new prompt, even if you already have it.",
    },
    replace: {
      label: "Replace my library",
      help: "Remove every prompt you have now and use only what is in the file. A safety copy is kept so you can undo it.",
    },
  };

  /* ------------------------------------------------------------------ *
   * Checksum
   * ------------------------------------------------------------------ */

  function checksum(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return "fnv1a32:" + hash.toString(16).padStart(8, "0");
  }

  /* ------------------------------------------------------------------ *
   * Creating
   * ------------------------------------------------------------------ */

  /** Only these settings travel in a backup, and only in this shape. */
  function pickSettings(settings) {
    const source = security.isPlainObject(settings) ? settings : {};
    const picked = {};
    if (source.theme === "light" || source.theme === "dark" || source.theme === "system") picked.theme = source.theme;
    if (typeof source.trackUsage === "boolean") picked.trackUsage = source.trackUsage;
    if (typeof source.sort === "string" && /^[a-z-]{1,20}$/.test(source.sort)) picked.sort = source.sort;
    return picked;
  }

  /**
   * Builds a backup document for the given library.
   * @param {{prompts: Array, versions?: object, settings?: object}} library
   * @param {string} [now] ISO timestamp (tests)
   */
  function createBackup(library, now) {
    const prompts = schema.normalizeAll(library && library.prompts);
    const cleaned = history.sanitizeVersions(library && library.versions, now);
    const versions = history.pruneOrphans(cleaned.versions, prompts).versions;

    const data = {
      prompts: history.syncVersionNumbers(prompts, versions),
      versions,
      settings: pickSettings(library && library.settings),
    };

    return {
      app: schema.APP_NAME,
      kind: "backup",
      schemaVersion: schema.SCHEMA_VERSION,
      appVersion: schema.APP_VERSION,
      createdAt: now || new Date().toISOString(),
      counts: { prompts: data.prompts.length, versions: history.counts(versions).entries },
      checksum: checksum(JSON.stringify(data)),
      data,
    };
  }

  /* ------------------------------------------------------------------ *
   * Inspecting (the preview)
   * ------------------------------------------------------------------ */

  /**
   * Parses, migrates and validates a file *without* changing anything.
   *
   * @param {string|object} input  file text or already-parsed JSON
   * @returns {{ok: boolean, errors: string[], warnings: string[], summary: object|null,
   *            prompts: Array, versions: object, settings: object|null}}
   */
  function inspect(input) {
    const result = { ok: false, errors: [], warnings: [], summary: null, prompts: [], versions: {}, settings: null };

    let data = input;
    let removedKeys = 0;
    try {
      if (typeof input === "string") {
        const parsed = security.safeParseJson(input);
        data = parsed.data;
        removedKeys = parsed.removedKeys;
      } else {
        const scrubbed = security.stripDangerousKeys(input);
        data = scrubbed.value;
        removedKeys = scrubbed.removed;
      }
    } catch (error) {
      result.errors.push(error.message || "That file could not be read.");
      return result;
    }

    const loaded = migrations.load(data);
    if (!loaded.ok) {
      result.errors.push(loaded.message);
      return result;
    }

    result.warnings.push(...loaded.warnings);
    if (removedKeys > 0) {
      result.warnings.push(`${removedKeys} unsafe ${removedKeys === 1 ? "field was" : "fields were"} removed from the file.`);
    }

    if (!loaded.prompts.length) {
      result.errors.push("That file does not contain any readable prompts.");
      return result;
    }

    const meta = loaded.meta || {};
    if (meta.app && meta.app !== schema.APP_NAME) {
      result.warnings.push("This file was not created by AI Prompt Toolkit. It will be read as a plain list of prompts.");
    }

    let integrity = "none";
    if (meta.checksum && loaded.payload) {
      integrity = checksum(JSON.stringify(loaded.payload)) === meta.checksum ? "ok" : "mismatch";
      if (integrity === "mismatch") {
        result.warnings.push(
          "The file's checksum does not match its contents. It may have been edited or damaged; check the preview before importing."
        );
      }
    }

    if (loaded.prompts.some((prompt) => security.hasBidiOverride(prompt.title) || security.hasBidiOverride(prompt.content))) {
      result.warnings.push(
        "Some text contains invisible text-direction override characters, which can make text display in a misleading order."
      );
    }

    result.ok = true;
    result.prompts = loaded.prompts;
    result.versions = loaded.versions;
    result.settings = loaded.settings ? pickSettings(loaded.settings) : null;
    result.summary = {
      kind: meta.kind || (Array.isArray(data) ? "legacy list" : "export"),
      prompts: loaded.prompts.length,
      versions: history.counts(loaded.versions).entries,
      schemaVersion: loaded.from,
      appVersion: meta.appVersion || "",
      createdAt: meta.createdAt || "",
      migratedFrom: loaded.from < loaded.to ? loaded.from : null,
      integrity,
    };
    return result;
  }

  /* ------------------------------------------------------------------ *
   * Planning an import
   * ------------------------------------------------------------------ */

  function sameContent(a, b) {
    return history.sameFields(history.fieldsOf(a), history.fieldsOf(b));
  }

  /**
   * Works out the library that results from importing `incoming` into
   * `current` with the given mode. Nothing is saved here.
   *
   * Whenever an existing prompt would be overwritten, its current text is
   * first recorded in its version history, so an import can always be
   * walked back through the History tab.
   *
   * @param {{prompts: Array, versions?: object}} current
   * @param {{prompts: Array, versions?: object}} incoming  (already validated by inspect)
   * @param {"merge"|"skip"|"update"|"new"|"replace"} mode
   * @param {string} [now]
   * @returns {{prompts: Array, versions: object, stats: {added: number, updated: number, skipped: number, removed: number}}}
   */
  function plan(current, incoming, mode, now) {
    if (!Object.prototype.hasOwnProperty.call(MODES, mode)) throw new Error(`Unknown import mode: ${mode}`);

    const stamp = now || new Date().toISOString();
    const existing = schema.normalizeAll(current && current.prompts);
    const incomingPrompts = schema.normalizeAll(incoming && incoming.prompts);
    const incomingVersions = (incoming && incoming.versions) || {};
    const stats = { added: 0, updated: 0, skipped: 0, removed: 0 };

    let versions = Object.assign({}, (current && current.versions) || {});

    const carry = (id, sourceId) => {
      const theirs = history.get(incomingVersions, sourceId);
      if (theirs.length) versions[id] = history.mergeLists(history.get(versions, id), theirs);
    };

    let prompts;

    if (mode === "replace") {
      const incomingIds = new Set(incomingPrompts.map((prompt) => prompt.id));
      const existingIds = new Set(existing.map((prompt) => prompt.id));
      stats.removed = existing.filter((prompt) => !incomingIds.has(prompt.id)).length;
      stats.updated = incomingPrompts.filter((prompt) => existingIds.has(prompt.id)).length;
      stats.added = incomingPrompts.length - stats.updated;
      versions = {};
      for (const prompt of incomingPrompts) carry(prompt.id, prompt.id);
      prompts = incomingPrompts;
    } else if (mode === "new") {
      const taken = new Set(existing.map((prompt) => prompt.id));
      prompts = existing.slice();
      for (const prompt of incomingPrompts) {
        let id = schema.createId();
        while (taken.has(id)) id = schema.createId();
        taken.add(id);
        prompts.push(Object.assign({}, prompt, { id, version: 1 }));
        carry(id, prompt.id);
        stats.added += 1;
      }
    } else {
      const byId = new Map(existing.map((prompt) => [prompt.id, prompt]));

      for (const prompt of incomingPrompts) {
        const have = byId.get(prompt.id);

        if (!have) {
          if (mode === "update") {
            stats.skipped += 1;
            continue;
          }
          byId.set(prompt.id, prompt);
          carry(prompt.id, prompt.id);
          stats.added += 1;
          continue;
        }

        const newer = Date.parse(prompt.updatedAt) > Date.parse(have.updatedAt);
        const shouldReplace = mode === "update" || (mode === "merge" && newer);
        if (!shouldReplace || sameContent(prompt, have)) {
          stats.skipped += 1;
          continue;
        }

        versions = history.record(versions, have, { reason: "before-import", force: true, now: stamp }).versions;
        byId.set(prompt.id, Object.assign({}, prompt, { usageCount: Math.max(prompt.usageCount, have.usageCount) }));
        carry(prompt.id, prompt.id);
        versions = history.record(versions, byId.get(prompt.id), { reason: "import", force: true, now: stamp }).versions;
        stats.updated += 1;
      }
      prompts = Array.from(byId.values());
    }

    versions = history.pruneOrphans(versions, prompts).versions;
    versions = history.enforceBudget(versions).versions;
    return { prompts: history.syncVersionNumbers(prompts, versions), versions, stats };
  }

  /** "3 added, 1 updated, 2 skipped" — or "nothing changed". */
  function describeStats(stats) {
    const parts = [
      stats.added ? `${stats.added} added` : "",
      stats.updated ? `${stats.updated} updated` : "",
      stats.removed ? `${stats.removed} removed` : "",
      stats.skipped ? `${stats.skipped} skipped` : "",
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : "nothing changed";
  }

  return { MODES, checksum, createBackup, describeStats, inspect, pickSettings, plan };
});
