const test = require("node:test");
const assert = require("node:assert/strict");
const schema = require("../assets/js/core/schema.js");

test("normalizePrompt fills in every field with sane defaults", () => {
  const prompt = schema.normalizePrompt({ title: "  Hello  ", content: " Body " });

  assert.equal(prompt.title, "Hello");
  assert.equal(prompt.content, "Body");
  assert.equal(prompt.category, "Uncategorized");
  assert.deepEqual(prompt.tags, []);
  assert.equal(prompt.favorite, false);
  assert.equal(prompt.usageCount, 0);
  assert.ok(prompt.id);
  assert.ok(Date.parse(prompt.createdAt));
  assert.ok(Date.parse(prompt.updatedAt));
});

test("normalizePrompt upgrades a version 1 prompt (tags were a string)", () => {
  const v1 = {
    id: "123",
    title: "YouTube Video Ideas",
    category: "Content Creation",
    tags: "youtube, ai, ideas",
    content: "Give me 10 creative YouTube video ideas...",
  };

  const prompt = schema.normalizePrompt(v1);

  assert.equal(prompt.id, "123");
  assert.deepEqual(prompt.tags, ["youtube", "ai", "ideas"]);
  assert.equal(prompt.favorite, false);
});

test("normalizeTags trims, de-duplicates case-insensitively and drops empties", () => {
  assert.deepEqual(schema.normalizeTags("  AI , ai ,, #seo , seo"), ["AI", "seo"]);
  assert.deepEqual(schema.normalizeTags(["one", "", "two"]), ["one", "two"]);
  assert.deepEqual(schema.normalizeTags(null), []);
});

test("normalizeTags respects the maximum tag count", () => {
  const many = Array.from({ length: 30 }, (_, index) => `tag${index}`);
  assert.equal(schema.normalizeTags(many).length, schema.LIMITS.tags);
});

test("titles longer than the limit are clipped instead of rejected", () => {
  const prompt = schema.normalizePrompt({ title: "x".repeat(500), content: "body" });
  assert.equal(prompt.title.length, schema.LIMITS.title);
});

test("normalizeAll drops empty entries and repairs duplicate ids", () => {
  const list = schema.normalizeAll([
    { id: "a", title: "One", content: "x" },
    { id: "a", title: "Two", content: "y" },
    { title: "", content: "" },
  ]);

  assert.equal(list.length, 2);
  assert.notEqual(list[0].id, list[1].id);
});

test("createExport writes a versioned envelope", () => {
  const data = schema.createExport([{ title: "A", content: "B" }]);

  assert.equal(data.app, "ai-prompt-toolkit");
  assert.equal(data.schemaVersion, schema.SCHEMA_VERSION);
  assert.equal(data.count, 1);
  assert.equal(data.prompts.length, 1);
});

test("parseExport accepts both the v2 envelope and a bare v1 array", () => {
  const envelope = JSON.stringify(schema.createExport([{ title: "A", content: "B" }]));
  const legacy = JSON.stringify([{ title: "Legacy", content: "C", tags: "x,y" }]);

  assert.equal(schema.parseExport(envelope).length, 1);
  assert.deepEqual(schema.parseExport(legacy)[0].tags, ["x", "y"]);
});

test("parseExport explains what is wrong with a bad file", () => {
  assert.throws(() => schema.parseExport("not json"), /valid JSON/);
  assert.throws(() => schema.parseExport('{"nope": 1}'), /No prompts/);
  assert.throws(() => schema.parseExport("[]"), /readable prompts/);
});

test("mergePrompts keeps the newest copy and reports what happened", () => {
  const current = [
    schema.normalizePrompt({ id: "a", title: "Old", content: "x", updatedAt: "2026-01-01T00:00:00.000Z" }),
    schema.normalizePrompt({ id: "b", title: "Keep", content: "y", updatedAt: "2026-01-01T00:00:00.000Z" }),
  ];
  const incoming = [
    { id: "a", title: "New", content: "x", updatedAt: "2026-06-01T00:00:00.000Z" },
    { id: "b", title: "Stale", content: "y", updatedAt: "2025-01-01T00:00:00.000Z" },
    { id: "c", title: "Fresh", content: "z" },
  ];

  const result = schema.mergePrompts(current, incoming);

  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.prompts.find((prompt) => prompt.id === "a").title, "New");
  assert.equal(result.prompts.find((prompt) => prompt.id === "b").title, "Keep");
});

test("toMarkdown renders a readable document", () => {
  const markdown = schema.toMarkdown([{ title: "A", content: "Body", tags: "x" }]);

  assert.match(markdown, /# AI Prompt Toolkit export/);
  assert.match(markdown, /## A/);
  assert.match(markdown, /Body/);
});
