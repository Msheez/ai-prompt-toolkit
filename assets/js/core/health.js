/**
 * health.js — a read-only health check for the saved library.
 *
 * It looks at what is actually stored (not at what the app holds in memory)
 * and reports problems in plain language. It never changes anything; fixing
 * is always a separate, confirmed action in the UI.
 *
 * Each check returns { id, level, message } where level is
 * "ok" | "info" | "warn" | "error".
 *
 * Pure and DOM-free.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./schema.js"), require("./history.js"), require("./security.js"));
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.health = factory(
      global.PromptToolkit.schema,
      global.PromptToolkit.history,
      global.PromptToolkit.security
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (schema, history, security) {
  "use strict";

  /**
   * Browsers allow about 5 million characters per site in localStorage. This
   * is an estimate used only to warn early; the real limit varies by browser.
   */
  const ESTIMATED_QUOTA_CHARS = 5 * 1024 * 1024;

  function check(id, level, message) {
    return { id, level, message };
  }

  function plural(count, word, many) {
    return `${count} ${count === 1 ? word : many || word + "s"}`;
  }

  /**
   * @param {object} input
   * @param {boolean} input.persistent       false in private browsing
   * @param {{code: string, message: string}|null} input.problem  from storage.getProblem()
   * @param {Array|null} input.rawPrompts    prompts exactly as stored (before normalising)
   * @param {object|null} input.rawVersions  history exactly as stored
   * @param {{total: number, legacy: number, safety: number, quarantine: number}} input.usage
   */
  function run(input) {
    const source = input || {};
    const checks = [];

    if (source.persistent === false) {
      checks.push(
        check("persistence", "warn", "Private browsing detected: nothing is being saved to this device. Export a backup before closing the tab.")
      );
    } else {
      checks.push(check("persistence", "ok", "Browser storage is available and writable."));
    }

    if (source.problem) {
      checks.push(check("readable", "error", source.problem.message));
      return finish(checks);
    }
    checks.push(check("readable", "ok", "The saved library can be read."));

    const raw = Array.isArray(source.rawPrompts) ? source.rawPrompts : [];
    const kept = schema.normalizeAll(raw);
    const unusable = raw.length - kept.length;
    if (unusable > 0) {
      checks.push(check("prompts", "warn", `${plural(unusable, "stored entry", "stored entries")} cannot be used (no title and no text) and will be dropped the next time the library is saved.`));
    } else {
      checks.push(check("prompts", "ok", `${plural(kept.length, "prompt")} stored, all readable.`));
    }

    const ids = new Set();
    let duplicates = 0;
    for (const entry of raw) {
      if (!security.isPlainObject(entry) || typeof entry.id !== "string") continue;
      if (ids.has(entry.id)) duplicates += 1;
      ids.add(entry.id);
    }
    if (duplicates > 0) {
      checks.push(check("duplicates", "warn", `${plural(duplicates, "prompt")} share an id with another prompt. They are given new ids when loaded, so nothing is lost.`));
    }

    const cleaned = history.sanitizeVersions(source.rawVersions);
    const orphans = history.pruneOrphans(cleaned.versions, kept).removed;
    if (cleaned.dropped > 0) {
      checks.push(check("history-damaged", "warn", `${plural(cleaned.dropped, "history entry", "history entries")} could not be read and will be skipped.`));
    }
    if (orphans > 0) {
      checks.push(check("history-orphans", "info", `History is stored for ${plural(orphans, "prompt")} that no longer exist. It is ignored and will be removed on the next save.`));
    }
    if (cleaned.dropped === 0 && orphans === 0) {
      const counts = history.counts(cleaned.versions);
      checks.push(check("history", "ok", `${plural(counts.entries, "saved version")} across ${plural(counts.prompts, "prompt")}.`));
    }

    const usage = source.usage || {};
    const used = Number(usage.total) || 0;
    const ratio = used / ESTIMATED_QUOTA_CHARS;
    const percent = Math.round(ratio * 100);
    if (ratio >= 0.9) {
      checks.push(check("quota", "error", `Browser storage is about ${percent}% full. Export a backup and delete old prompts or versions soon.`));
    } else if (ratio >= 0.6) {
      checks.push(check("quota", "warn", `Browser storage is about ${percent}% full. Consider exporting a backup.`));
    } else {
      checks.push(check("quota", "ok", `Browser storage is about ${percent}% full.`));
    }

    if (usage.quarantine > 0) {
      checks.push(check("quarantine", "info", "A damaged copy of earlier data was set aside. You can download it from this panel."));
    }
    if (usage.safety > 0) {
      checks.push(check("safety", "info", "A safety copy from before your last import is available to restore."));
    }
    if (usage.legacy > 0) {
      checks.push(check("legacy", "info", "Copies in older storage formats are still kept after the upgrade. You can remove them once you are happy with your library."));
    }

    return finish(checks);
  }

  function finish(checks) {
    const order = { ok: 0, info: 1, warn: 2, error: 3 };
    const worst = checks.reduce((level, entry) => (order[entry.level] > order[level] ? entry.level : level), "ok");
    return { checks, worst };
  }

  return { ESTIMATED_QUOTA_CHARS, run };
});
