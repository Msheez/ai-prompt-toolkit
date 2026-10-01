const test = require("node:test");
const assert = require("node:assert/strict");
const variables = require("../assets/js/core/variables.js");

const template = "Write a YouTube script about {{topic}} for {{audience|beginners}} in a {{tone}} tone.";

test("extractVariables finds each placeholder once, in order", () => {
  const found = variables.extractVariables(template);

  assert.deepEqual(found.map((variable) => variable.name), ["topic", "audience", "tone"]);
  assert.equal(found[1].defaultValue, "beginners");
  assert.equal(found[0].label, "Topic");
});

test("repeated placeholders are listed only once", () => {
  const found = variables.extractVariables("{{name}} and {{ name }} and {{NAME}}");
  assert.equal(found.length, 1);
});

test("hasVariables detects templates", () => {
  assert.equal(variables.hasVariables(template), true);
  assert.equal(variables.hasVariables("plain prompt"), false);
  assert.equal(variables.hasVariables(""), false);
});

test("applyVariables fills values, falls back to defaults and keeps the rest", () => {
  const filled = variables.applyVariables(template, { topic: "Artificial Intelligence", tone: "friendly" });

  assert.equal(
    filled,
    "Write a YouTube script about Artificial Intelligence for beginners in a friendly tone."
  );
});

test("an unanswered placeholder without a default is left visible", () => {
  const filled = variables.applyVariables("Hello {{name}}", {});
  assert.equal(filled, "Hello {{name}}");
});

test("values are matched case insensitively and whitespace is ignored", () => {
  assert.equal(variables.applyVariables("{{ Topic }}", { topic: "AI" }), "AI");
});

test("countUnfilled only counts placeholders with no value and no default", () => {
  assert.equal(variables.countUnfilled(template, {}), 2);
  assert.equal(variables.countUnfilled(template, { topic: "AI" }), 1);
  assert.equal(variables.countUnfilled(template, { topic: "AI", tone: "calm" }), 0);
});

test("defaultValues seeds the form with inline defaults", () => {
  assert.deepEqual(variables.defaultValues(template), { topic: "", audience: "beginners", tone: "" });
});

test("segment splits text and placeholders for the preview", () => {
  const parts = variables.segment("Hi {{name}}!", { name: "Sam" });

  assert.deepEqual(parts, [
    { type: "text", text: "Hi " },
    { type: "variable", name: "name", filled: true, text: "Sam" },
    { type: "text", text: "!" },
  ]);
});

test("segment flags placeholders that still need a value", () => {
  const parts = variables.segment("Hi {{name}}", {});
  assert.equal(parts[1].filled, false);
  assert.equal(parts[1].text, "{{name}}");
});

test("malformed braces are left alone", () => {
  assert.deepEqual(variables.extractVariables("{{}} {{ }} { single }"), []);
  assert.equal(variables.applyVariables("100% {not a var}", { a: "b" }), "100% {not a var}");
});
