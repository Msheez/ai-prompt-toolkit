const test = require("node:test");
const assert = require("node:assert/strict");
const migrations = require("../assets/js/core/migrations.js");
const schema = require("../assets/js/core/schema.js");

const V1 = [
  { id: "1", title: "YouTube Video Ideas", category: "Content", tags: "youtube, ai", content: "Give me 10 ideas", starred: true },
  { id: "2", title: "Code review", category: "Dev", tags: "code", content: "Review this" },
];

test("a v1 bare array migrates through every step to the current schema", () => {
  const result = migrations.load(V1);

  assert.equal(result.ok, true);
  assert.equal(result.from, 1);
  assert.equal(result.to, schema.SCHEMA_VERSION);
  assert.deepEqual(result.steps, ["1 → 2", "2 → 3"]);
  assert.equal(result.prompts.length, 2);
  assert.deepEqual(result.prompts[0].tags, ["youtube", "ai"]);
  assert.equal(result.prompts[0].favorite, true, "v1 `starred` becomes `favorite`");
  assert.equal(result.prompts[0].version, 1);
});

test("a v2 envelope migrates with only the last step", () => {
  const result = migrations.load({ app: "ai-prompt-toolkit", schemaVersion: 2, prompts: V1 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.steps, ["2 → 3"]);
  assert.deepEqual(result.versions, {});
});

test("current-schema data needs no steps", () => {
  const result = migrations.load({ schemaVersion: schema.SCHEMA_VERSION, prompts: V1 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.steps, []);
});

test("migration never mutates the input", () => {
  const input = JSON.parse(JSON.stringify(V1));
  const snapshot = JSON.stringify(input);
  migrations.load(input);

  assert.equal(JSON.stringify(input), snapshot);
});

test("data from a newer app version is refused, not silently downgraded", () => {
  const result = migrations.load({ schemaVersion: schema.SCHEMA_VERSION + 1, prompts: V1 });

  assert.equal(result.ok, false);
  assert.equal(result.code, "newer");
  assert.match(result.message, /newer version/);
  assert.match(result.message, /nothing has been changed/i);
});

test("input with no prompt list is reported as unreadable", () => {
  for (const input of [null, 5, "text", {}, { prompts: "nope" }, { data: {} }]) {
    const result = migrations.load(input);
    assert.equal(result.ok, false, JSON.stringify(input));
  }
});

test("a missing or invalid schemaVersion is treated as the oldest format", () => {
  assert.equal(migrations.versionOf({}), 1);
  assert.equal(migrations.versionOf({ schemaVersion: "x" }), 1);
  assert.equal(migrations.versionOf({ schemaVersion: 0 }), 1);
  assert.equal(migrations.versionOf({ schemaVersion: "3" }), 3);
});

test("blank entries are skipped with a warning instead of failing the import", () => {
  const result = migrations.load({ schemaVersion: 2, prompts: [{ title: "", content: "" }, { title: "Keep", content: "x" }] });

  assert.equal(result.ok, true);
  assert.equal(result.prompts.length, 1);
  assert.equal(result.warnings.length, 1);
});

test("the prompt limit is enforced", () => {
  const prompts = Array.from({ length: 5001 }, (_, i) => ({ title: `p${i}`, content: "x" }));
  const result = migrations.load({ schemaVersion: 2, prompts });

  assert.equal(result.ok, false);
  assert.equal(result.code, "too-many");
});

test("a full backup's history is validated and attached to the right prompts", () => {
  const result = migrations.load({
    schemaVersion: 3,
    data: {
      prompts: [{ id: "a", title: "A", content: "now" }],
      versions: {
        a: [{ n: 1, title: "A", content: "before", savedAt: "2026-01-01T00:00:00Z" }],
        ghost: [{ n: 1, title: "G", content: "orphan" }],
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.versions), ["a"], "history for missing prompts is dropped");
  assert.equal(result.prompts[0].version, 1);
});
