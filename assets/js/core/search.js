/**
 * search.js — filtering, ranking and sorting.
 *
 * Version 2 of the toolkit searches four fields at once (title, prompt text,
 * category, tags) and combines that with the category / tag / favourite
 * filters. Everything here is pure so the behaviour is covered by unit tests.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.search = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SORTS = [
    { value: "updated", label: "Recently updated" },
    { value: "created", label: "Recently created" },
    { value: "title", label: "Title (A–Z)" },
    { value: "used", label: "Most used" },
  ];

  const DEFAULT_FILTERS = {
    query: "",
    category: "all",
    tags: [],
    favoritesOnly: false,
    sort: "updated",
  };

  function toText(value) {
    return String(value === null || value === undefined ? "" : value).toLowerCase();
  }

  /** Splits a query into search terms, keeping "quoted phrases" together. */
  function tokenize(query) {
    const text = toText(query).trim();
    if (!text) return [];
    const tokens = [];
    const pattern = /"([^"]+)"|(\S+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const token = (match[1] || match[2] || "").trim();
      if (token) tokens.push(token);
    }
    return tokens;
  }

  function fieldsOf(prompt) {
    return {
      title: toText(prompt.title),
      content: toText(prompt.content),
      category: toText(prompt.category),
      tags: toText(Array.isArray(prompt.tags) ? prompt.tags.join(" ") : prompt.tags),
      notes: toText(prompt.notes),
    };
  }

  /**
   * Scores one prompt against the search tokens.
   * Returns 0 when any token is missing (tokens are combined with AND).
   */
  function scorePrompt(prompt, tokens) {
    if (!tokens.length) return 1;
    const fields = fieldsOf(prompt);
    let score = 0;

    for (const token of tokens) {
      let best = 0;
      if (fields.title === token) best = 120;
      else if (fields.title.startsWith(token)) best = 90;
      else if (fields.title.includes(token)) best = 70;

      if (fields.tags.split(/\s+/).includes(token)) best = Math.max(best, 60);
      else if (fields.tags.includes(token)) best = Math.max(best, 40);

      if (fields.category.includes(token)) best = Math.max(best, 35);
      if (fields.content.includes(token)) best = Math.max(best, 20);
      if (fields.notes.includes(token)) best = Math.max(best, 10);

      if (!best) return 0;
      score += best;
    }

    if (prompt.favorite) score += 15;
    return score;
  }

  function matchesFilters(prompt, filters) {
    const settings = Object.assign({}, DEFAULT_FILTERS, filters || {});

    if (settings.favoritesOnly && !prompt.favorite) return false;

    if (settings.category && settings.category !== "all") {
      if (toText(prompt.category) !== toText(settings.category)) return false;
    }

    const wanted = Array.isArray(settings.tags) ? settings.tags : [];
    if (wanted.length) {
      const owned = (Array.isArray(prompt.tags) ? prompt.tags : []).map(toText);
      // Tags are combined with AND: a prompt must carry every selected tag.
      if (!wanted.every((tag) => owned.includes(toText(tag)))) return false;
    }

    return true;
  }

  function sortPrompts(prompts, sort) {
    const list = prompts.slice();
    const byUpdated = (a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);

    switch (sort) {
      case "title":
        return list.sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: "base" }));
      case "created":
        return list.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
      case "used":
        return list.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || byUpdated(a, b));
      case "updated":
      default:
        return list.sort(byUpdated);
    }
  }

  /**
   * The one function the UI calls: search + filters + sorting.
   * When a query is present, results are ordered by relevance instead.
   */
  function queryPrompts(prompts, filters) {
    const settings = Object.assign({}, DEFAULT_FILTERS, filters || {});
    const tokens = tokenize(settings.query);
    const source = Array.isArray(prompts) ? prompts : [];

    const matched = [];
    for (const prompt of source) {
      if (!matchesFilters(prompt, settings)) continue;
      const score = scorePrompt(prompt, tokens);
      if (!score) continue;
      matched.push({ prompt, score });
    }

    if (!tokens.length) return sortPrompts(matched.map((entry) => entry.prompt), settings.sort);

    matched.sort((a, b) => b.score - a.score || Date.parse(b.prompt.updatedAt || 0) - Date.parse(a.prompt.updatedAt || 0));
    return matched.map((entry) => entry.prompt);
  }

  /** Unique categories, alphabetical, with a count for each. */
  function collectCategories(prompts) {
    const counts = new Map();
    for (const prompt of prompts || []) {
      const name = String(prompt.category || "").trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }

  /** Unique tags ordered by popularity, then alphabetically. */
  function collectTags(prompts) {
    const counts = new Map();
    for (const prompt of prompts || []) {
      for (const tag of prompt.tags || []) {
        const name = String(tag).trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const entry = counts.get(key) || { name, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
      }
    }
    return Array.from(counts.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }

  /**
   * Splits text into {text, match} segments so the UI can highlight matches
   * with DOM nodes instead of injecting HTML strings.
   */
  function highlight(text, tokens, limit) {
    const value = String(text === null || text === undefined ? "" : text);
    const max = limit || value.length;
    const clipped = value.length > max ? value.slice(0, max).trimEnd() + "…" : value;
    if (!tokens || !tokens.length) return [{ text: clipped, match: false }];

    const lower = clipped.toLowerCase();
    const ranges = [];
    for (const token of tokens) {
      if (!token) continue;
      let from = lower.indexOf(token);
      while (from !== -1) {
        ranges.push([from, from + token.length]);
        from = lower.indexOf(token, from + token.length);
      }
    }
    if (!ranges.length) return [{ text: clipped, match: false }];

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0]];
    for (const range of ranges.slice(1)) {
      const last = merged[merged.length - 1];
      if (range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push(range);
    }

    const segments = [];
    let cursor = 0;
    for (const [from, to] of merged) {
      if (from > cursor) segments.push({ text: clipped.slice(cursor, from), match: false });
      segments.push({ text: clipped.slice(from, to), match: true });
      cursor = to;
    }
    if (cursor < clipped.length) segments.push({ text: clipped.slice(cursor), match: false });
    return segments;
  }

  /** Human readable summary of the filters currently applied. */
  function describeFilters(filters) {
    const settings = Object.assign({}, DEFAULT_FILTERS, filters || {});
    const chips = [];
    if (settings.query.trim()) chips.push({ type: "query", label: `Search: “${settings.query.trim()}”` });
    if (settings.category && settings.category !== "all") {
      chips.push({ type: "category", label: `Category: ${settings.category}` });
    }
    for (const tag of settings.tags || []) chips.push({ type: "tag", value: tag, label: `#${tag}` });
    if (settings.favoritesOnly) chips.push({ type: "favorite", label: "Favourites only" });
    return chips;
  }

  function hasActiveFilters(filters) {
    return describeFilters(filters).length > 0;
  }

  return {
    DEFAULT_FILTERS,
    SORTS,
    collectCategories,
    collectTags,
    describeFilters,
    hasActiveFilters,
    highlight,
    matchesFilters,
    queryPrompts,
    scorePrompt,
    sortPrompts,
    tokenize,
  };
});
