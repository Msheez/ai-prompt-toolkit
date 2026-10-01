/**
 * variables.js — reusable prompt templates.
 *
 * A prompt can contain placeholders:
 *
 *   Write a YouTube script about {{topic}} for {{audience|beginners}}.
 *
 * `extractVariables` finds them (with optional defaults after the `|`) and
 * `applyVariables` fills them in. Unknown placeholders are left untouched so
 * nothing silently disappears from a prompt.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.variables = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // {{ name }} or {{ name | default value }}
  const PATTERN = /\{\{\s*([a-zA-Z0-9_][a-zA-Z0-9 _.-]*?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g;
  const MAX_VARIABLES = 20;

  function keyOf(name) {
    return String(name).trim().toLowerCase();
  }

  function labelOf(name) {
    const text = String(name).trim().replace(/[_.-]+/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /** Returns [{ name, key, label, defaultValue }] in order of appearance. */
  function extractVariables(text) {
    const source = String(text === null || text === undefined ? "" : text);
    const found = new Map();
    PATTERN.lastIndex = 0;
    let match;

    while ((match = PATTERN.exec(source)) !== null) {
      const name = match[1].trim();
      if (!name) continue;
      const key = keyOf(name);
      if (found.has(key)) {
        // A later default wins only if the first occurrence had none.
        const existing = found.get(key);
        if (!existing.defaultValue && match[2]) existing.defaultValue = match[2];
        continue;
      }
      found.set(key, {
        name,
        key,
        label: labelOf(name),
        defaultValue: match[2] ? String(match[2]) : "",
      });
      if (found.size >= MAX_VARIABLES) break;
    }

    return Array.from(found.values());
  }

  function hasVariables(text) {
    PATTERN.lastIndex = 0;
    return PATTERN.test(String(text === null || text === undefined ? "" : text));
  }

  /**
   * Replaces placeholders with `values` (keyed by variable name, case
   * insensitive). Falls back to the inline default, then to the original
   * placeholder text.
   */
  function applyVariables(text, values) {
    const source = String(text === null || text === undefined ? "" : text);
    const lookup = new Map();
    for (const [name, value] of Object.entries(values || {})) {
      lookup.set(keyOf(name), value === null || value === undefined ? "" : String(value));
    }

    PATTERN.lastIndex = 0;
    return source.replace(PATTERN, (full, name, fallback) => {
      const key = keyOf(name);
      if (lookup.has(key) && lookup.get(key).trim() !== "") return lookup.get(key);
      if (fallback) return String(fallback);
      return full;
    });
  }

  /** How many placeholders still need a value — used for the "ready" badge. */
  function countUnfilled(text, values) {
    return extractVariables(text).filter((variable) => {
      const provided = values ? values[variable.name] || values[variable.key] : "";
      return !(provided && String(provided).trim()) && !variable.defaultValue;
    }).length;
  }

  /**
   * Splits text into segments so the preview can colour filled and unfilled
   * placeholders without building HTML strings by hand.
   * @returns {Array<{type: "text"|"variable", text: string, name?: string, filled?: boolean}>}
   */
  function segment(text, values) {
    const source = String(text === null || text === undefined ? "" : text);
    const lookup = new Map();
    for (const [name, value] of Object.entries(values || {})) {
      lookup.set(keyOf(name), value === null || value === undefined ? "" : String(value));
    }

    const segments = [];
    let cursor = 0;
    let match;
    PATTERN.lastIndex = 0;

    while ((match = PATTERN.exec(source)) !== null) {
      if (match.index > cursor) {
        segments.push({ type: "text", text: source.slice(cursor, match.index) });
      }
      const key = keyOf(match[1]);
      const provided = lookup.has(key) ? lookup.get(key) : "";
      const value = provided.trim() ? provided : match[2] || "";
      segments.push({
        type: "variable",
        name: match[1].trim(),
        filled: Boolean(value),
        text: value || `{{${match[1].trim()}}}`,
      });
      cursor = match.index + match[0].length;
    }

    if (cursor < source.length) segments.push({ type: "text", text: source.slice(cursor) });
    return segments;
  }

  /** Default value map for a template, ready to seed the form inputs. */
  function defaultValues(text) {
    const values = {};
    for (const variable of extractVariables(text)) values[variable.key] = variable.defaultValue;
    return values;
  }

  return {
    MAX_VARIABLES,
    applyVariables,
    countUnfilled,
    defaultValues,
    extractVariables,
    hasVariables,
    segment,
  };
});
