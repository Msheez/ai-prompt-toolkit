const test = require("node:test");
const assert = require("node:assert/strict");
const security = require("../assets/js/core/security.js");
const schema = require("../assets/js/core/schema.js");

test("safeParseJson rejects oversized input before parsing", () => {
  const big = '{"a":"' + "x".repeat(200) + '"}';
  assert.throws(
    () => security.safeParseJson(big, { maxBytes: 100 }),
    (error) => error.code === "too-large"
  );
});

test("safeParseJson reports invalid JSON with a friendly message", () => {
  assert.throws(
    () => security.safeParseJson("{nope"),
    (error) => error instanceof security.ImportError && error.code === "bad-json"
  );
  assert.throws(() => security.safeParseJson(42), (error) => error.code === "not-text");
});

test("safeParseJson accepts a UTF-8 byte order mark", () => {
  assert.deepEqual(security.safeParseJson('﻿{"a":1}').data, { a: 1 });
});

test("prototype-pollution keys are removed and counted", () => {
  const text = '{"prompts":[{"title":"A","__proto__":{"polluted":true},"constructor":{"x":1}}]}';
  const { data, removedKeys } = security.safeParseJson(text);

  assert.equal(removedKeys, 2);
  assert.equal(({}).polluted, undefined, "Object.prototype is untouched");
  assert.equal(Object.prototype.hasOwnProperty.call(data.prompts[0], "__proto__"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(data.prompts[0], "constructor"), false);
});

test("excessive nesting is refused", () => {
  const deep = "[".repeat(40) + "]".repeat(40);
  assert.throws(() => security.safeParseJson(deep), (error) => error.code === "too-deep");
});

test("sanitizeString removes control characters but keeps tabs and newlines", () => {
  assert.equal(security.sanitizeString("a\u0000b\u0007c\td\ne"), "abc\td\ne");
  assert.equal(security.sanitizeString(null), "");
});

test("broken UTF-16 is repaired so text can always be exported", () => {
  const broken = "ok \ud800 end \udc00";
  const fixed = security.toWellFormed(broken);

  assert.equal(fixed, "ok � end �");
  assert.doesNotThrow(() => encodeURIComponent(fixed));
  // A valid surrogate pair (an emoji) is left alone.
  assert.equal(security.toWellFormed("hi 😀"), "hi 😀");
});

test("truncating a prompt never leaves half an emoji behind", () => {
  const title = "a".repeat(119) + "😀"; // the emoji straddles the 120 limit
  const prompt = schema.normalizePrompt({ title, content: "x" });

  assert.doesNotThrow(() => encodeURIComponent(prompt.title));
  assert.ok(prompt.title.length <= schema.LIMITS.title);
});

test("HTML and script payloads are kept as plain text, never interpreted", () => {
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const prompt = schema.normalizePrompt({ title: payload, content: payload, tags: payload });

  // The data layer stores text as-is. Safety comes from the UI only ever
  // using textContent; tests/ui-safety.test.js enforces that.
  assert.equal(prompt.content, payload);
  assert.equal(typeof prompt.title, "string");
});

test("dangerous ids are replaced with fresh ones", () => {
  for (const id of ["__proto__", "constructor", "prototype", "x".repeat(101)]) {
    const prompt = schema.normalizePrompt({ id, title: "A", content: "B" });
    assert.notEqual(prompt.id, id);
  }
});

test("bidirectional override characters are detected", () => {
  assert.equal(security.hasBidiOverride("hello ‮ world"), true);
  assert.equal(security.hasBidiOverride("plain text"), false);
});

test("unexpected value types become safe strings", () => {
  const prompt = schema.normalizePrompt({
    title: { toString: () => "from object" },
    content: ["a", "b"],
    tags: { not: "an array" },
    usageCount: "abc",
    favorite: "yes",
  });

  assert.equal(typeof prompt.title, "string");
  assert.equal(typeof prompt.content, "string");
  assert.deepEqual(prompt.tags, []);
  assert.equal(prompt.usageCount, 0);
  assert.equal(prompt.favorite, true);
});

test("Markdown export cannot be broken out of by backticks in a prompt", () => {
  const md = schema.toMarkdown([{ title: "Tricky", content: "before\n```\n# injected heading\n```\nafter" }]);
  const fence = md.match(/^(`{4,})text$/m);

  assert.ok(fence, "uses a fence longer than any run inside the prompt");
  assert.ok(md.includes(fence[1] + "\n"), "and closes it with the same fence");
});
