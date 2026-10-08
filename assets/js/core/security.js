/**
 * security.js — the one place where untrusted input is checked and cleaned.
 *
 * Everything that enters the app from outside (an imported file, a restored
 * backup, data found in storage) goes through these helpers before it is
 * normalised by schema.js. Keeping the rules here means there is exactly one
 * file to audit.
 *
 * What this module does:
 *   - refuses oversized input before parsing it
 *   - parses JSON and removes keys that could tamper with object prototypes
 *   - limits nesting depth
 *   - removes control characters and repairs broken UTF-16 in text
 *
 * What it deliberately does NOT do: "sanitise HTML". The app never turns
 * prompt text into markup (it only uses textContent / createTextNode), so the
 * correct defence is to never parse it as HTML in the first place.
 *
 * Pure and DOM-free, so it runs unchanged in the browser and in `npm test`.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.security = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LIMITS = {
    /** Largest file the importer will even try to parse (bytes). */
    maxImportBytes: 5 * 1024 * 1024,
    /** Most prompts accepted from a single file. */
    maxPrompts: 5000,
    /** Deepest object nesting accepted in imported JSON. */
    maxDepth: 12,
  };

  /** Keys that must never be copied from untrusted JSON. */
  const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

  /** A friendly, user-facing error. `code` lets callers branch without parsing text. */
  class ImportError extends Error {
    constructor(message, code) {
      super(message);
      this.name = "ImportError";
      this.code = code || "invalid";
    }
  }

  function isDangerousKey(key) {
    return DANGEROUS_KEYS.has(key);
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  /**
   * Replaces lone surrogates (broken UTF-16) with U+FFFD so that text can be
   * safely encoded, stored and exported. Uses the native method when present.
   */
  function toWellFormed(text) {
    if (typeof text.toWellFormed === "function") return text.toWellFormed();
    let out = "";
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          out += text[i] + text[i + 1];
          i += 1;
        } else {
          out += "�";
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        out += "�";
      } else {
        out += text[i];
      }
    }
    return out;
  }

  // C0 controls except tab, line feed and carriage return; plus DEL.
  const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  /** Converts any value to a string with control characters removed and valid UTF-16. */
  function sanitizeString(value) {
    if (value === null || value === undefined) return "";
    return toWellFormed(String(value).replace(CONTROL_CHARS, ""));
  }

  // Embedding / override controls that can make text display in a misleading order.
  const BIDI_OVERRIDES = /[‪-‮⁦-⁩]/;

  function hasBidiOverride(value) {
    return typeof value === "string" && BIDI_OVERRIDES.test(value);
  }

  function byteLength(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return text.length;
  }

  /**
   * Deep-copies parsed JSON while dropping dangerous keys.
   * @returns {{value: *, removed: number}}
   */
  function stripDangerousKeys(input) {
    let removed = 0;

    function walk(value, depth) {
      if (depth > LIMITS.maxDepth) {
        throw new ImportError("That file is nested too deeply to be a prompt library.", "too-deep");
      }
      if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1));
      if (isPlainObject(value)) {
        const copy = {};
        for (const key of Object.keys(value)) {
          if (isDangerousKey(key)) {
            removed += 1;
            continue;
          }
          copy[key] = walk(value[key], depth + 1);
        }
        return copy;
      }
      return value;
    }

    return { value: walk(input, 0), removed };
  }

  /**
   * Parses untrusted JSON text. Never executes anything: JSON.parse only
   * builds data, and the result is scrubbed before it is returned.
   * @returns {{data: *, removedKeys: number}}
   * @throws {ImportError}
   */
  function safeParseJson(text, options) {
    const maxBytes = (options && options.maxBytes) || LIMITS.maxImportBytes;
    if (typeof text !== "string") throw new ImportError("That file could not be read as text.", "not-text");

    if (byteLength(text) > maxBytes) {
      const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
      throw new ImportError(`That file is too large to import (the limit is ${mb} MB).`, "too-large");
    }

    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new ImportError("That file is not valid JSON.", "bad-json");
    }

    const cleaned = stripDangerousKeys(parsed);
    return { data: cleaned.value, removedKeys: cleaned.removed };
  }

  return {
    DANGEROUS_KEYS,
    ImportError,
    LIMITS,
    byteLength,
    hasBidiOverride,
    isDangerousKey,
    isPlainObject,
    safeParseJson,
    sanitizeString,
    stripDangerousKeys,
    toWellFormed,
  };
});
