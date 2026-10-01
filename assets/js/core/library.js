/**
 * library.js — pure operations on a list of prompts.
 *
 * Every function returns a *new* array instead of mutating the old one, which
 * keeps undo/redo-style features (like "Undo delete") simple and keeps the
 * functions trivially testable.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./schema.js"));
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.library = factory(global.PromptToolkit.schema);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (schema) {
  "use strict";

  function find(prompts, id) {
    return (prompts || []).find((prompt) => prompt.id === id) || null;
  }

  /** Inserts a new prompt or replaces an existing one by id. */
  function upsert(prompts, draft) {
    const list = Array.isArray(prompts) ? prompts.slice() : [];
    const now = new Date().toISOString();
    const index = list.findIndex((prompt) => prompt.id === draft.id);

    if (index === -1) {
      const created = schema.normalizePrompt(Object.assign({ createdAt: now }, draft, { updatedAt: now }));
      return { prompts: [created].concat(list), prompt: created, created: true };
    }

    const merged = schema.normalizePrompt(
      Object.assign({}, list[index], draft, { createdAt: list[index].createdAt, updatedAt: now })
    );
    list[index] = merged;
    return { prompts: list, prompt: merged, created: false };
  }

  function remove(prompts, id) {
    const list = Array.isArray(prompts) ? prompts : [];
    const index = list.findIndex((prompt) => prompt.id === id);
    if (index === -1) return { prompts: list.slice(), removed: null, index: -1 };
    return { prompts: list.slice(0, index).concat(list.slice(index + 1)), removed: list[index], index };
  }

  /** Puts a removed prompt back where it was (used by "Undo"). */
  function restore(prompts, prompt, index) {
    const list = Array.isArray(prompts) ? prompts.slice() : [];
    const at = Math.max(0, Math.min(Number.isInteger(index) ? index : list.length, list.length));
    list.splice(at, 0, schema.normalizePrompt(prompt));
    return list;
  }

  function duplicate(prompts, id) {
    const original = find(prompts, id);
    if (!original) return { prompts: Array.isArray(prompts) ? prompts.slice() : [], prompt: null };
    const now = new Date().toISOString();
    const copy = schema.normalizePrompt(
      Object.assign({}, original, {
        id: schema.createId(),
        title: `${original.title} (copy)`,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      })
    );
    const list = Array.isArray(prompts) ? prompts.slice() : [];
    const index = list.findIndex((prompt) => prompt.id === id);
    list.splice(index + 1, 0, copy);
    return { prompts: list, prompt: copy };
  }

  function patch(prompts, id, changes) {
    let updated = null;
    const list = (Array.isArray(prompts) ? prompts : []).map((prompt) => {
      if (prompt.id !== id) return prompt;
      updated = schema.normalizePrompt(Object.assign({}, prompt, changes));
      return updated;
    });
    return { prompts: list, prompt: updated };
  }

  function toggleFavorite(prompts, id) {
    const current = find(prompts, id);
    if (!current) return { prompts: Array.isArray(prompts) ? prompts.slice() : [], prompt: null };
    return patch(prompts, id, { favorite: !current.favorite, updatedAt: current.updatedAt });
  }

  /** Counted when a prompt is copied, so "Most used" sorting means something. */
  function markUsed(prompts, id) {
    const current = find(prompts, id);
    if (!current) return { prompts: Array.isArray(prompts) ? prompts.slice() : [], prompt: null };
    return patch(prompts, id, {
      usageCount: (current.usageCount || 0) + 1,
      updatedAt: current.updatedAt,
    });
  }

  /** Numbers for the sidebar footer. */
  function stats(prompts) {
    const list = Array.isArray(prompts) ? prompts : [];
    const categories = new Set();
    const tags = new Set();
    let favorites = 0;
    let words = 0;

    for (const prompt of list) {
      if (prompt.category) categories.add(String(prompt.category).toLowerCase());
      for (const tag of prompt.tags || []) tags.add(String(tag).toLowerCase());
      if (prompt.favorite) favorites += 1;
      words += String(prompt.content || "").split(/\s+/).filter(Boolean).length;
    }

    return { total: list.length, categories: categories.size, tags: tags.size, favorites, words };
  }

  return { duplicate, find, markUsed, patch, remove, restore, stats, toggleFavorite, upsert };
});
