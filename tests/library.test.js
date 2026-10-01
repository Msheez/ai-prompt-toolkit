const test = require("node:test");
const assert = require("node:assert/strict");
const schema = require("../assets/js/core/schema.js");
const library = require("../assets/js/core/library.js");

function seed() {
  return schema.normalizeAll([
    { id: "a", title: "First", content: "one", category: "Writing", tags: "x" },
    { id: "b", title: "Second", content: "two", category: "Code", tags: "y", favorite: true },
  ]);
}

test("upsert adds a new prompt to the top of the library", () => {
  const result = library.upsert(seed(), { title: "Third", content: "three" });

  assert.equal(result.created, true);
  assert.equal(result.prompts.length, 3);
  assert.equal(result.prompts[0].title, "Third");
});

test("upsert updates in place and keeps the original creation date", () => {
  const prompts = seed();
  const result = library.upsert(prompts, { id: "a", title: "Renamed", content: "one" });

  assert.equal(result.created, false);
  assert.equal(result.prompts.length, 2);
  assert.equal(result.prompts[0].title, "Renamed");
  assert.equal(result.prompts[0].createdAt, prompts[0].createdAt);
  assert.ok(Date.parse(result.prompts[0].updatedAt) >= Date.parse(prompts[0].updatedAt));
});

test("operations never mutate the array they are given", () => {
  const prompts = seed();
  library.upsert(prompts, { title: "New", content: "x" });
  library.remove(prompts, "a");
  library.toggleFavorite(prompts, "a");

  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].title, "First");
  assert.equal(prompts[0].favorite, false);
});

test("remove reports the position so it can be restored", () => {
  const removal = library.remove(seed(), "b");

  assert.equal(removal.index, 1);
  assert.equal(removal.removed.title, "Second");
  assert.equal(removal.prompts.length, 1);

  const restored = library.restore(removal.prompts, removal.removed, removal.index);
  assert.deepEqual(restored.map((prompt) => prompt.id), ["a", "b"]);
});

test("removing an unknown id is a no-op", () => {
  const removal = library.remove(seed(), "nope");
  assert.equal(removal.removed, null);
  assert.equal(removal.prompts.length, 2);
});

test("duplicate inserts a copy right after the original", () => {
  const result = library.duplicate(seed(), "a");

  assert.equal(result.prompts.length, 3);
  assert.equal(result.prompts[1].title, "First (copy)");
  assert.notEqual(result.prompts[1].id, "a");
  assert.equal(result.prompts[1].usageCount, 0);
});

test("toggleFavorite flips the star without touching updatedAt", () => {
  const prompts = seed();
  const result = library.toggleFavorite(prompts, "a");

  assert.equal(result.prompt.favorite, true);
  assert.equal(result.prompt.updatedAt, prompts[0].updatedAt);
  assert.equal(library.toggleFavorite(result.prompts, "a").prompt.favorite, false);
});

test("markUsed counts copies for the 'most used' sort", () => {
  const once = library.markUsed(seed(), "a");
  const twice = library.markUsed(once.prompts, "a");

  assert.equal(twice.prompt.usageCount, 2);
});

test("stats summarise the library", () => {
  const data = library.stats(seed());

  assert.deepEqual(data, { total: 2, categories: 2, tags: 2, favorites: 1, words: 2 });
});

test("stats on an empty library are all zero", () => {
  assert.deepEqual(library.stats([]), { total: 0, categories: 0, tags: 0, favorites: 0, words: 0 });
});
