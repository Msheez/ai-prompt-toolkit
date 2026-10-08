/**
 * schema.js — the shape of a prompt and how libraries are read/written.
 *
 * This module is pure: it has no access to the DOM or to localStorage, which
 * makes every function in it easy to unit test with `npm test`.
 *
 * Works in the browser (attached to `window.PromptToolkit.schema`) and in
 * Node.js (`require("./schema.js")`) without any build step.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./security.js"));
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.schema = factory(global.PromptToolkit.security);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (security) {
  "use strict";

  /**
   * Bumped whenever the stored shape of data changes. Every bump needs a
   * migration step in migrations.js and a test for it.
   *   1 — original release (bare array, tags as a string)
   *   2 — envelope, tags array, favourites, usage counts
   *   3 — prompt `version` number + separate version history
   */
  const SCHEMA_VERSION = 3;
  /** Must match package.json, sw.js and the footer in index.html (tests enforce it). */
  const APP_VERSION = "3.2.0";
  const APP_NAME = "ai-prompt-toolkit";

  const LIMITS = {
    title: 120,
    category: 50,
    tag: 30,
    tags: 12,
    content: 20000,
    notes: 500,
  };

  const DEFAULT_CATEGORY = "Uncategorized";

  /** Creates an id that works in old browsers and in Node. */
  function createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function clean(value, maxLength) {
    // Slicing can cut a surrogate pair in half, so repair after truncating.
    return security.toWellFormed(security.sanitizeString(value).replace(/\s+/g, " ").trim().slice(0, maxLength));
  }

  function cleanMultiline(value, maxLength) {
    return security.toWellFormed(
      security.sanitizeString(value).replace(/\r\n?/g, "\n").trim().slice(0, maxLength)
    );
  }

  function isIsoDate(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
  }

  function toIsoDate(value, fallback) {
    if (isIsoDate(value)) return new Date(value).toISOString();
    return fallback;
  }

  /**
   * Accepts "a, b" | ["a", "b"] | "a b" and returns a clean, de-duplicated
   * array of tags. Comparison is case-insensitive, the first spelling wins.
   */
  function normalizeTags(value) {
    let raw = [];
    if (Array.isArray(value)) raw = value;
    else if (typeof value === "string") raw = value.split(/[,\n]/);

    const seen = new Set();
    const tags = [];
    for (const entry of raw) {
      const tag = clean(entry, LIMITS.tag).replace(/^#/, "");
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
      if (tags.length >= LIMITS.tags) break;
    }
    return tags;
  }

  function tagsToInput(tags) {
    return normalizeTags(tags).join(", ");
  }

  /**
   * Turns anything that looks like a prompt (including v1 prompts, where
   * `tags` was a plain string and favourites did not exist) into the current
   * schema. Unknown fields are dropped on purpose.
   */
  function normalizePrompt(raw, now) {
    const source = raw && typeof raw === "object" ? raw : {};
    const timestamp = now || new Date().toISOString();
    const createdAt = toIsoDate(source.createdAt, toIsoDate(source.updatedAt, timestamp));
    const usage = Number.parseInt(source.usageCount, 10);
    const revision = Number.parseInt(source.version, 10);
    const rawId = typeof source.id === "string" ? source.id.trim() : "";

    return {
      // Ids end up as object keys and in the URL hash, so odd ones are replaced.
      id: rawId && rawId.length <= 100 && !security.isDangerousKey(rawId) ? rawId : createId(),
      title: clean(source.title, LIMITS.title) || "Untitled prompt",
      category: clean(source.category, LIMITS.category) || DEFAULT_CATEGORY,
      tags: normalizeTags(source.tags),
      content: cleanMultiline(source.content, LIMITS.content),
      notes: clean(source.notes, LIMITS.notes),
      favorite: Boolean(source.favorite || source.starred),
      usageCount: Number.isFinite(usage) && usage > 0 ? usage : 0,
      version: Number.isFinite(revision) && revision > 0 ? revision : 1,
      createdAt,
      updatedAt: toIsoDate(source.updatedAt, createdAt),
    };
  }

  /** A blank prompt, ready for the editor. */
  function createPrompt(overrides) {
    return normalizePrompt(Object.assign({ title: "", content: "" }, overrides || {}));
  }

  /** True when neither a title nor any prompt text was supplied. */
  function isBlank(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return !clean(source.title, LIMITS.title) && !cleanMultiline(source.content, LIMITS.content);
  }

  function normalizeAll(list, now) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    for (const entry of list) {
      if (isBlank(entry)) continue;
      const prompt = normalizePrompt(entry, now);
      if (seen.has(prompt.id)) prompt.id = createId();
      seen.add(prompt.id);
      result.push(prompt);
    }
    return result;
  }

  /** The envelope written by "Export": metadata + prompts. */
  function createExport(prompts) {
    return {
      app: APP_NAME,
      kind: "export",
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      count: Array.isArray(prompts) ? prompts.length : 0,
      prompts: normalizeAll(prompts),
    };
  }

  /**
   * Reads an export file. Accepts the v2 envelope *and* a bare v1 array so old
   * backups keep working. Throws a friendly Error when the file is not usable.
   */
  function parseExport(input) {
    let data = input;
    if (typeof input === "string") data = security.safeParseJson(input).data;

    let list = null;
    if (Array.isArray(data)) list = data;
    else if (data && typeof data === "object" && Array.isArray(data.prompts)) list = data.prompts;
    else if (data && typeof data === "object" && data.data && Array.isArray(data.data.prompts)) {
      list = data.data.prompts; // a full backup file: the prompts live under `data`
    }

    if (!list) throw new Error("No prompts found in that file.");

    const prompts = normalizeAll(list);
    if (!prompts.length) throw new Error("That file does not contain any readable prompts.");
    return prompts;
  }

  /**
   * Merges imported prompts into the library.
   * - same id  -> the most recently updated copy wins
   * - new id   -> appended
   */
  function mergePrompts(current, incoming) {
    const byId = new Map();
    for (const prompt of normalizeAll(current)) byId.set(prompt.id, prompt);

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const prompt of normalizeAll(incoming)) {
      const existing = byId.get(prompt.id);
      if (!existing) {
        byId.set(prompt.id, prompt);
        added += 1;
      } else if (Date.parse(prompt.updatedAt) > Date.parse(existing.updatedAt)) {
        byId.set(prompt.id, prompt);
        updated += 1;
      } else {
        skipped += 1;
      }
    }

    return { prompts: Array.from(byId.values()), added, updated, skipped };
  }

  /**
   * A code fence that is always longer than any run of backticks inside the
   * text, so a prompt that itself contains ``` cannot close the fence early
   * and spill into the surrounding Markdown.
   */
  function fenceFor(text) {
    let longest = 0;
    for (const run of String(text).match(/`+/g) || []) longest = Math.max(longest, run.length);
    return "`".repeat(Math.max(3, longest + 1));
  }

  /** Renders the library as a readable Markdown document. */
  function toMarkdown(prompts) {
    const list = normalizeAll(prompts);
    const lines = ["# AI Prompt Toolkit export", "", `${list.length} prompt${list.length === 1 ? "" : "s"}`, ""];
    for (const prompt of list) {
      const fence = fenceFor(prompt.content);
      lines.push(`## ${prompt.title}`, "");
      lines.push(`- Category: ${prompt.category}`);
      if (prompt.tags.length) lines.push(`- Tags: ${prompt.tags.join(", ")}`);
      lines.push(`- Updated: ${prompt.updatedAt.slice(0, 10)}`, "");
      if (prompt.notes) lines.push(`> ${prompt.notes}`, "");
      lines.push(`${fence}text`, prompt.content, fence, "");
    }
    return lines.join("\n");
  }

  return {
    APP_NAME,
    APP_VERSION,
    DEFAULT_CATEGORY,
    LIMITS,
    SCHEMA_VERSION,
    createExport,
    createId,
    createPrompt,
    mergePrompts,
    normalizeAll,
    normalizePrompt,
    normalizeTags,
    isBlank,
    parseExport,
    tagsToInput,
    toMarkdown,
  };
});
