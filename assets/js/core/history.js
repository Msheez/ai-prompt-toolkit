/**
 * history.js — per-prompt version history.
 *
 * A "version map" is a plain object: { [promptId]: [entry, entry, ...] }.
 * Each entry is a full snapshot of the editable fields of a prompt:
 *
 *   { n, createdAt, savedAt, reason, title, category, tags, notes, content }
 *
 * Rules (all covered by tests):
 *   - Saving never destroys anything. Restoring an old version first snapshots
 *     the current text, then writes the restored text as a *new* version.
 *   - Autosave does not flood the history: while the newest entry is an
 *     autosave created less than five minutes ago, it is updated in place.
 *     An explicit save (button / Ctrl+S) always creates its own entry.
 *   - A prompt keeps at most 25 versions; the oldest are dropped first.
 *   - A global size budget protects the browser's storage quota. When it is
 *     exceeded the oldest non-latest entries across all prompts are dropped.
 *
 * Every function returns new objects; nothing is mutated. Pure and DOM-free.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./schema.js"), require("./security.js"));
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.history = factory(global.PromptToolkit.schema, global.PromptToolkit.security);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (schema, security) {
  "use strict";

  const LIMITS = {
    maxVersions: 25,
    coalesceMs: 5 * 60 * 1000,
    budgetChars: 1200000,
    maxDiffLines: 2000,
  };

  const REASONS = {
    autosave: "Autosaved",
    save: "Saved",
    restore: "Restored",
    "before-restore": "Before restore",
    "before-import": "Before import",
    baseline: "Original",
    import: "Imported",
  };

  function reasonLabel(reason) {
    return REASONS[reason] || "Saved";
  }

  function own(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key);
  }

  function isoOr(value, fallback) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value))
      ? new Date(value).toISOString()
      : fallback;
  }

  /** The editable fields of a prompt, normalised. */
  function fieldsOf(source) {
    const prompt = schema.normalizePrompt(source);
    return {
      title: prompt.title,
      category: prompt.category,
      tags: prompt.tags.slice(),
      notes: prompt.notes,
      content: prompt.content,
    };
  }

  function sameFields(a, b) {
    return (
      a.title === b.title &&
      a.category === b.category &&
      a.notes === b.notes &&
      a.content === b.content &&
      a.tags.join("\u0001") === b.tags.join("\u0001")
    );
  }

  function latest(list) {
    return Array.isArray(list) && list.length ? list[list.length - 1] : null;
  }

  function get(versions, id) {
    return versions && own(versions, id) && Array.isArray(versions[id]) ? versions[id].slice() : [];
  }

  /* ------------------------------------------------------------------ *
   * Sanitising (data that came from storage or from a file)
   * ------------------------------------------------------------------ */

  function sanitizeEntry(raw, now) {
    if (!security.isPlainObject(raw)) return null;
    const fields = fieldsOf(raw);
    if (!fields.content && fields.title === "Untitled prompt") return null;

    const savedAt = isoOr(raw.savedAt, isoOr(raw.createdAt, now));
    const n = Number.parseInt(raw.n, 10);
    return Object.assign(
      {
        n: Number.isFinite(n) && n > 0 ? n : 0,
        createdAt: isoOr(raw.createdAt, savedAt),
        savedAt,
        reason: typeof raw.reason === "string" && own(REASONS, raw.reason) ? raw.reason : "save",
      },
      fields
    );
  }

  /** Sorts by version number, then guarantees strictly increasing numbers. */
  function sanitizeList(list, now) {
    const entries = (Array.isArray(list) ? list : [])
      .slice(-LIMITS.maxVersions * 4)
      .map((raw) => sanitizeEntry(raw, now))
      .filter(Boolean);

    entries.sort((a, b) => (a.n || Infinity) - (b.n || Infinity) || Date.parse(a.savedAt) - Date.parse(b.savedAt));

    let last = 0;
    for (const entry of entries) {
      if (!entry.n || entry.n <= last) entry.n = last + 1;
      last = entry.n;
    }
    return entries.slice(-LIMITS.maxVersions);
  }

  /**
   * Validates a whole version map from untrusted storage/file data.
   * @returns {{versions: object, dropped: number}}
   */
  function sanitizeVersions(input, now) {
    const stamp = now || new Date().toISOString();
    const result = {};
    let dropped = 0;
    if (!security.isPlainObject(input)) return { versions: result, dropped };

    const keys = Object.keys(input);
    for (const key of keys.slice(0, security.LIMITS.maxPrompts)) {
      if (security.isDangerousKey(key) || key.length > 100) {
        dropped += Array.isArray(input[key]) ? input[key].length : 1;
        continue;
      }
      const raw = Array.isArray(input[key]) ? input[key] : [];
      const kept = sanitizeList(raw, stamp);
      dropped += Math.max(0, raw.length - kept.length);
      if (kept.length) result[key] = kept;
    }
    return { versions: result, dropped };
  }

  /* ------------------------------------------------------------------ *
   * Recording
   * ------------------------------------------------------------------ */

  /**
   * Records the state of `prompt` in its history.
   *
   * @param {object} versions   current version map
   * @param {object} prompt     the prompt as it is *now*
   * @param {object} [options]
   * @param {string} [options.reason]    why this entry exists (see REASONS)
   * @param {boolean} [options.force]    always create a new entry (explicit save)
   * @param {object} [options.previous]  the prompt as it was before this change;
   *   used to keep the original text when a prompt gets its first history entry
   * @param {string} [options.now]       ISO timestamp (tests)
   * @returns {{versions: object, entry: object|null, changed: boolean}}
   */
  function record(versions, prompt, options) {
    const opts = options || {};
    const map = versions || {};
    const now = isoOr(opts.now, new Date().toISOString());
    const force = Boolean(opts.force);
    const reason = typeof opts.reason === "string" && own(REASONS, opts.reason) ? opts.reason : force ? "save" : "autosave";
    const id = prompt.id;
    const fields = fieldsOf(prompt);
    const list = get(map, id);

    // The first entry for an existing prompt must not lose what was there before.
    if (!list.length && opts.previous) {
      const before = fieldsOf(opts.previous);
      if (before.content && !sameFields(before, fields)) {
        const when = isoOr(opts.previous.updatedAt, now);
        list.push(Object.assign({ n: 1, createdAt: when, savedAt: when, reason: "baseline" }, before));
      }
    }

    const last = latest(list);
    if (last && sameFields(last, fields)) {
      return { versions: map, entry: last, changed: false };
    }

    let entry;
    const recent = last && Date.parse(now) - Date.parse(last.createdAt) <= LIMITS.coalesceMs;
    if (!force && last && last.reason === "autosave" && recent) {
      entry = Object.assign({}, last, fields, { savedAt: now });
      list[list.length - 1] = entry;
    } else {
      entry = Object.assign({ n: (last ? last.n : 0) + 1, createdAt: now, savedAt: now, reason }, fields);
      list.push(entry);
    }

    while (list.length > LIMITS.maxVersions) list.shift();

    return { versions: Object.assign({}, map, { [id]: list }), entry, changed: true };
  }

  /** Returns prompts whose `version` matches the newest history entry. */
  function syncVersionNumbers(prompts, versions) {
    return (prompts || []).map((prompt) => {
      const last = latest(get(versions || {}, prompt.id));
      const next = last ? last.n : 1;
      return prompt.version === next ? prompt : Object.assign({}, prompt, { version: next });
    });
  }

  /* ------------------------------------------------------------------ *
   * Restoring and deleting
   * ------------------------------------------------------------------ */

  function find(versions, id, n) {
    return get(versions, id).find((entry) => entry.n === n) || null;
  }

  /** The editable fields from a history entry, ready to apply to a prompt. */
  function fieldsForRestore(entry) {
    return fieldsOf(entry);
  }

  /** Deletes one old version. The newest version cannot be deleted. */
  function remove(versions, id, n) {
    const list = get(versions, id);
    const last = latest(list);
    if (!last || !list.some((entry) => entry.n === n)) {
      return { versions, removed: false, reason: "missing" };
    }
    if (last.n === n) return { versions, removed: false, reason: "latest" };
    return {
      versions: Object.assign({}, versions, { [id]: list.filter((entry) => entry.n !== n) }),
      removed: true,
    };
  }

  /** Removes the history of prompts that no longer exist. */
  function pruneOrphans(versions, prompts) {
    const ids = new Set((prompts || []).map((prompt) => prompt.id));
    const result = {};
    let removed = 0;
    for (const key of Object.keys(versions || {})) {
      if (ids.has(key)) result[key] = versions[key];
      else removed += 1;
    }
    return { versions: result, removed };
  }

  /** Merges two lists for the same prompt (used when importing history). */
  function mergeLists(a, b) {
    const combined = (a || []).concat(b || []);
    combined.sort((x, y) => Date.parse(x.savedAt) - Date.parse(y.savedAt) || x.n - y.n);

    const merged = [];
    for (const entry of combined) {
      const previous = merged[merged.length - 1];
      if (previous && sameFields(previous, entry)) continue;
      merged.push(Object.assign({}, entry, { n: merged.length + 1 }));
    }
    return merged.slice(-LIMITS.maxVersions);
  }

  /* ------------------------------------------------------------------ *
   * Size budget
   * ------------------------------------------------------------------ */

  function entryChars(entry) {
    return (
      entry.title.length +
      entry.category.length +
      entry.notes.length +
      entry.content.length +
      entry.tags.join(",").length +
      80
    );
  }

  function totalChars(versions) {
    let total = 0;
    for (const key of Object.keys(versions || {})) {
      for (const entry of versions[key]) total += entryChars(entry);
    }
    return total;
  }

  /**
   * Drops the oldest non-latest entries (across all prompts) until the
   * history fits the budget. The newest entry of every prompt is always kept.
   */
  function enforceBudget(versions, budget) {
    const limit = typeof budget === "number" ? budget : LIMITS.budgetChars;
    let total = totalChars(versions);
    if (total <= limit) return { versions, dropped: 0, total };

    const candidates = [];
    for (const key of Object.keys(versions)) {
      const list = versions[key];
      for (let index = 0; index < list.length - 1; index += 1) {
        candidates.push({ key, n: list[index].n, at: Date.parse(list[index].savedAt), size: entryChars(list[index]) });
      }
    }
    candidates.sort((x, y) => x.at - y.at || x.n - y.n);

    const drop = new Map();
    for (const candidate of candidates) {
      if (total <= limit) break;
      if (!drop.has(candidate.key)) drop.set(candidate.key, new Set());
      drop.get(candidate.key).add(candidate.n);
      total -= candidate.size;
    }

    const result = {};
    let dropped = 0;
    for (const key of Object.keys(versions)) {
      const removeSet = drop.get(key);
      const kept = removeSet ? versions[key].filter((entry) => !removeSet.has(entry.n)) : versions[key];
      dropped += versions[key].length - kept.length;
      result[key] = kept;
    }
    return { versions: result, dropped, total };
  }

  function counts(versions) {
    let entries = 0;
    let prompts = 0;
    for (const key of Object.keys(versions || {})) {
      if (versions[key].length) {
        prompts += 1;
        entries += versions[key].length;
      }
    }
    return { prompts, entries };
  }

  /* ------------------------------------------------------------------ *
   * Diff
   * ------------------------------------------------------------------ */

  /**
   * Line-based diff (longest common subsequence).
   * @returns {{ops: Array<{type: "same"|"add"|"del", text: string}>, added: number, removed: number, truncated: boolean}}
   */
  function diffLines(before, after) {
    const A = before === "" ? [] : String(before).split("\n");
    const B = after === "" ? [] : String(after).split("\n");

    if (A.length > LIMITS.maxDiffLines || B.length > LIMITS.maxDiffLines) {
      const ops = A.map((text) => ({ type: "del", text })).concat(B.map((text) => ({ type: "add", text })));
      return { ops, added: B.length, removed: A.length, truncated: true };
    }

    let start = 0;
    while (start < A.length && start < B.length && A[start] === B[start]) start += 1;
    let endA = A.length;
    let endB = B.length;
    while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
      endA -= 1;
      endB -= 1;
    }

    const midA = A.slice(start, endA);
    const midB = B.slice(start, endB);
    const n = midA.length;
    const m = midB.length;
    const width = m + 1;
    const table = new Uint16Array((n + 1) * width);

    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        table[i * width + j] =
          midA[i - 1] === midB[j - 1]
            ? table[(i - 1) * width + (j - 1)] + 1
            : Math.max(table[(i - 1) * width + j], table[i * width + (j - 1)]);
      }
    }

    const middle = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midA[i - 1] === midB[j - 1]) {
        middle.push({ type: "same", text: midA[i - 1] });
        i -= 1;
        j -= 1;
      } else if (j > 0 && (i === 0 || table[i * width + (j - 1)] >= table[(i - 1) * width + j])) {
        middle.push({ type: "add", text: midB[j - 1] });
        j -= 1;
      } else {
        middle.push({ type: "del", text: midA[i - 1] });
        i -= 1;
      }
    }
    middle.reverse();

    const ops = []
      .concat(A.slice(0, start).map((text) => ({ type: "same", text })))
      .concat(middle)
      .concat(A.slice(endA).map((text) => ({ type: "same", text })));

    let added = 0;
    let removed = 0;
    for (const op of ops) {
      if (op.type === "add") added += 1;
      else if (op.type === "del") removed += 1;
    }
    return { ops, added, removed, truncated: false };
  }

  /**
   * Collapses long runs of unchanged lines into { type: "skip", count } so a
   * diff of a long prompt stays readable.
   */
  function collapse(ops, context) {
    const keep = typeof context === "number" ? context : 2;
    const visible = new Array(ops.length).fill(false);
    ops.forEach((op, index) => {
      if (op.type === "same") return;
      for (let k = Math.max(0, index - keep); k <= Math.min(ops.length - 1, index + keep); k += 1) visible[k] = true;
    });

    const result = [];
    let skipped = 0;
    ops.forEach((op, index) => {
      if (visible[index]) {
        if (skipped) {
          result.push({ type: "skip", count: skipped });
          skipped = 0;
        }
        result.push(op);
      } else {
        skipped += 1;
      }
    });
    if (skipped) result.push({ type: "skip", count: skipped });
    return result;
  }

  /** Compares two entries (or any two objects with the editable fields). */
  function diffEntries(from, to) {
    const a = fieldsOf(from);
    const b = fieldsOf(to);
    const fields = [];
    for (const field of ["title", "category", "notes"]) {
      if (a[field] !== b[field]) fields.push({ field, from: a[field], to: b[field] });
    }
    if (a.tags.join("\u0001") !== b.tags.join("\u0001")) {
      fields.push({ field: "tags", from: a.tags.join(", "), to: b.tags.join(", ") });
    }
    const lines = diffLines(a.content, b.content);
    return { fields, lines, changed: fields.length > 0 || lines.added + lines.removed > 0 };
  }

  return {
    LIMITS,
    REASONS,
    collapse,
    counts,
    diffEntries,
    diffLines,
    enforceBudget,
    fieldsForRestore,
    fieldsOf,
    find,
    get,
    latest,
    mergeLists,
    pruneOrphans,
    reasonLabel,
    record,
    remove,
    sameFields,
    sanitizeVersions,
    syncVersionNumbers,
    totalChars,
  };
});
