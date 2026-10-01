const test = require("node:test");
const assert = require("node:assert/strict");
const schema = require("../assets/js/core/schema.js");
const search = require("../assets/js/core/search.js");

const prompts = schema.normalizeAll([
  {
    id: "yt",
    title: "YouTube Video Ideas",
    category: "Content Creation",
    tags: "youtube, ai, ideas",
    content: "Give me 10 creative YouTube video ideas about artificial intelligence for beginners.",
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "email",
    title: "Email Writer",
    category: "Writing",
    tags: "email, business",
    content: "Write a polite follow-up email about the AI project.",
    favorite: true,
    updatedAt: "2026-03-02T10:00:00.000Z",
  },
  {
    id: "seo",
    title: "SEO Article Outline",
    category: "Content Creation",
    tags: "seo, writing",
    content: "Create an outline for an article about search engines.",
    updatedAt: "2026-03-03T10:00:00.000Z",
  },
]);

test("tokenize splits words and keeps quoted phrases together", () => {
  assert.deepEqual(search.tokenize('ai  "video ideas"'), ["ai", "video ideas"]);
  assert.deepEqual(search.tokenize("   "), []);
});

test("search looks in the title, text, category and tags", () => {
  const byTitle = search.queryPrompts(prompts, { query: "youtube" });
  const byContent = search.queryPrompts(prompts, { query: "beginners" });
  const byCategory = search.queryPrompts(prompts, { query: "content creation" });
  const byTag = search.queryPrompts(prompts, { query: "business" });

  assert.deepEqual(byTitle.map((prompt) => prompt.id), ["yt"]);
  assert.deepEqual(byContent.map((prompt) => prompt.id), ["yt"]);
  assert.deepEqual(byCategory.map((prompt) => prompt.id).sort(), ["seo", "yt"]);
  assert.deepEqual(byTag.map((prompt) => prompt.id), ["email"]);
});

test("a title match ranks above a body match", () => {
  const results = search.queryPrompts(prompts, { query: "email" });
  assert.equal(results[0].id, "email");
});

test("multiple words are combined with AND", () => {
  assert.equal(search.queryPrompts(prompts, { query: "youtube email" }).length, 0);
  assert.equal(search.queryPrompts(prompts, { query: "youtube ideas" }).length, 1);
});

test("search and the category filter work together", () => {
  const results = search.queryPrompts(prompts, { query: "ai", category: "Content Creation" });
  assert.deepEqual(results.map((prompt) => prompt.id), ["yt"]);
});

test("selecting a category that excludes the search gives no results", () => {
  const results = search.queryPrompts(prompts, { query: "youtube", category: "Writing" });
  assert.equal(results.length, 0);
});

test("tag filters are combined with AND", () => {
  assert.equal(search.queryPrompts(prompts, { tags: ["seo"] }).length, 1);
  assert.equal(search.queryPrompts(prompts, { tags: ["seo", "writing"] }).length, 1);
  assert.equal(search.queryPrompts(prompts, { tags: ["seo", "email"] }).length, 0);
});

test("the favourites filter only keeps starred prompts", () => {
  const results = search.queryPrompts(prompts, { favoritesOnly: true });
  assert.deepEqual(results.map((prompt) => prompt.id), ["email"]);
});

test("no filters returns everything, newest first", () => {
  const results = search.queryPrompts(prompts, {});
  assert.deepEqual(results.map((prompt) => prompt.id), ["seo", "email", "yt"]);
});

test("sorting by title is alphabetical and case insensitive", () => {
  const results = search.queryPrompts(prompts, { sort: "title" });
  assert.deepEqual(results.map((prompt) => prompt.title), [
    "Email Writer",
    "SEO Article Outline",
    "YouTube Video Ideas",
  ]);
});

test("sorting by usage puts the most copied prompt first", () => {
  const used = prompts.map((prompt) => (prompt.id === "yt" ? Object.assign({}, prompt, { usageCount: 9 }) : prompt));
  assert.equal(search.queryPrompts(used, { sort: "used" })[0].id, "yt");
});

test("collectCategories and collectTags count correctly", () => {
  assert.deepEqual(search.collectCategories(prompts), [
    { name: "Content Creation", count: 2 },
    { name: "Writing", count: 1 },
  ]);
  assert.equal(search.collectTags(prompts)[0].count, 1);
  assert.equal(search.collectTags(prompts).length, 7);
});

test("describeFilters explains the active filters, hasActiveFilters mirrors it", () => {
  const filters = { query: "ai", category: "Writing", tags: ["email"], favoritesOnly: true };

  assert.equal(search.describeFilters(filters).length, 4);
  assert.equal(search.hasActiveFilters(filters), true);
  assert.equal(search.hasActiveFilters(search.DEFAULT_FILTERS), false);
});

test("highlight marks every match and clips long text", () => {
  const segments = search.highlight("YouTube video ideas", ["video"]);
  assert.deepEqual(segments, [
    { text: "YouTube ", match: false },
    { text: "video", match: true },
    { text: " ideas", match: false },
  ]);

  const clipped = search.highlight("x".repeat(200), [], 20);
  assert.equal(clipped[0].text.length, 21); // 20 characters plus the ellipsis
});

test("overlapping matches are merged instead of nested", () => {
  const segments = search.highlight("aaaa", ["aa", "aaa"]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].match, true);
});
