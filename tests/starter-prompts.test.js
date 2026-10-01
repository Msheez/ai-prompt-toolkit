const test = require("node:test");
const assert = require("node:assert/strict");
const schema = require("../assets/js/core/schema.js");
const variables = require("../assets/js/core/variables.js");
const starterPrompts = require("../assets/js/core/starter-prompts.js");

test("the starter pack is a valid, non-empty library", () => {
  assert.ok(starterPrompts.length >= 5);

  const normalized = schema.normalizeAll(starterPrompts);
  assert.equal(normalized.length, starterPrompts.length, "no starter prompt is dropped as empty");

  for (const prompt of normalized) {
    assert.ok(prompt.title.length > 2, `${prompt.title} has a title`);
    assert.ok(prompt.content.length > 20, `${prompt.title} has real content`);
    assert.notEqual(prompt.category, "Uncategorized", `${prompt.title} has a category`);
    assert.ok(prompt.tags.length > 0, `${prompt.title} has tags`);
  }
});

test("starter titles are unique", () => {
  const titles = starterPrompts.map((prompt) => prompt.title.toLowerCase());
  assert.equal(new Set(titles).size, titles.length);
});

test("most starter prompts are reusable templates", () => {
  const templates = starterPrompts.filter((prompt) => variables.hasVariables(prompt.content));
  assert.ok(templates.length >= starterPrompts.length - 1);
});

test("every placeholder in the pack is well formed", () => {
  for (const prompt of starterPrompts) {
    for (const variable of variables.extractVariables(prompt.content)) {
      assert.match(variable.name, /^[a-z0-9_ ]+$/i, `${prompt.title}: ${variable.name}`);
    }
  }
});
