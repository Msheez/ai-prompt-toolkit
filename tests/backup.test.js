const test = require("node:test");
const assert = require("node:assert/strict");
const backup = require("../assets/js/core/backup.js");
const history = require("../assets/js/core/history.js");
const schema = require("../assets/js/core/schema.js");

const T = (minutes) => new Date(Date.parse("2026-02-01T00:00:00Z") + minutes * 60000).toISOString();
const p = (id, content, minutes, extra) =>
  Object.assign({ id, title: id.toUpperCase(), content, createdAt: T(0), updatedAt: T(minutes) }, extra);
const lib = (prompts, versions) => ({ prompts, versions: versions || {} });

test("a backup round-trips through inspect with a valid checksum", () => {
  const file = backup.createBackup(lib([p("a", "hello", 1)]), T(5));
  const preview = backup.inspect(JSON.stringify(file));

  assert.equal(preview.ok, true);
  assert.equal(preview.summary.kind, "backup");
  assert.equal(preview.summary.integrity, "ok");
  assert.equal(preview.summary.prompts, 1);
  assert.equal(preview.prompts[0].content, "hello");
  assert.equal(file.schemaVersion, schema.SCHEMA_VERSION);
  assert.equal(file.appVersion, schema.APP_VERSION);
});

test("a backup carries version history and only whitelisted settings", () => {
  const versions = history.record({}, p("a", "v1", 1), { force: true, now: T(1) }).versions;
  const file = backup.createBackup(
    { prompts: [p("a", "v1", 1)], versions, settings: { theme: "light", apiKey: "sk-secret", sort: "az" } },
    T(5)
  );

  assert.equal(file.counts.versions, 1);
  assert.deepEqual(file.data.settings, { theme: "light", sort: "az" });
  assert.ok(!JSON.stringify(file).includes("sk-secret"));
});

test("editing a backup by hand is detected by the checksum", () => {
  const file = backup.createBackup(lib([p("a", "original", 1)]), T(5));
  file.data.prompts[0].content = "tampered";
  const preview = backup.inspect(JSON.stringify(file));

  assert.equal(preview.ok, true, "still importable — the user decides");
  assert.equal(preview.summary.integrity, "mismatch");
  assert.ok(preview.warnings.some((warning) => /checksum/i.test(warning)));
});

test("inspect rejects invalid JSON, wrong shapes and empty libraries", () => {
  assert.equal(backup.inspect("{not json").ok, false);
  assert.equal(backup.inspect("[]").ok, false);
  assert.equal(backup.inspect('{"hello":1}').ok, false);
  assert.equal(backup.inspect('{"prompts":[]}').ok, false);
  assert.match(backup.inspect("{not json").errors[0], /not valid JSON/);
});

test("inspect rejects a file from a newer version with a clear message", () => {
  const preview = backup.inspect(JSON.stringify({ schemaVersion: 99, prompts: [{ title: "x", content: "y" }] }));

  assert.equal(preview.ok, false);
  assert.match(preview.errors[0], /newer version/);
});

test("inspect strips unsafe keys and tells the user", () => {
  const text = '{"prompts":[{"title":"A","content":"B","__proto__":{"x":1}}]}';
  const preview = backup.inspect(text);

  assert.equal(preview.ok, true);
  assert.ok(preview.warnings.some((warning) => /unsafe/.test(warning)));
});

test("inspect reports a migrated legacy file", () => {
  const preview = backup.inspect(JSON.stringify([{ title: "Old", content: "x", tags: "a,b" }]));

  assert.equal(preview.ok, true);
  assert.equal(preview.summary.migratedFrom, 1);
  assert.equal(preview.summary.kind, "legacy list");
});

test("inspect warns about foreign files and bidirectional-override text", () => {
  const foreign = backup.inspect(JSON.stringify({ app: "other-app", prompts: [{ title: "x", content: "y" }] }));
  assert.ok(foreign.warnings.some((warning) => /not created by/.test(warning)));

  const bidi = backup.inspect(JSON.stringify([{ title: "x", content: "evil ‮ text" }]));
  assert.ok(bidi.warnings.some((warning) => /direction/.test(warning)));
});

test("inspect accepts already-parsed objects and still scrubs them", () => {
  const parsed = JSON.parse('{"prompts":[{"title":"A","content":"B","__proto__":1}]}');
  assert.equal(backup.inspect(parsed).ok, true);
});

/* ---- import modes ---------------------------------------------------- */

const current = () => lib([p("a", "mine-old", 1), p("b", "mine-b", 5)]);

test("merge: newer file copies win, older ones are skipped, new ones are added", () => {
  const incoming = lib([p("a", "file-newer", 10), p("b", "file-older", 2), p("c", "file-new", 3)]);
  const result = backup.plan(current(), incoming, "merge", T(20));
  const byId = Object.fromEntries(result.prompts.map((prompt) => [prompt.id, prompt]));

  assert.equal(byId.a.content, "file-newer");
  assert.equal(byId.b.content, "mine-b");
  assert.equal(byId.c.content, "file-new");
  assert.deepEqual(result.stats, { added: 1, updated: 1, skipped: 1, removed: 0 });
});

test("skip: only brand-new prompts are added, existing ones are untouched", () => {
  const incoming = lib([p("a", "file-newer", 10), p("c", "file-new", 3)]);
  const result = backup.plan(current(), incoming, "skip", T(20));
  const byId = Object.fromEntries(result.prompts.map((prompt) => [prompt.id, prompt]));

  assert.equal(byId.a.content, "mine-old");
  assert.equal(byId.c.content, "file-new");
  assert.deepEqual(result.stats, { added: 1, updated: 0, skipped: 1, removed: 0 });
});

test("update: overwrites matches even if older, and ignores prompts you do not have", () => {
  const incoming = lib([p("b", "file-older", 2), p("c", "file-new", 3)]);
  const result = backup.plan(current(), incoming, "update", T(20));
  const ids = result.prompts.map((prompt) => prompt.id).sort();
  const b = result.prompts.find((prompt) => prompt.id === "b");

  assert.deepEqual(ids, ["a", "b"], "c is not added");
  assert.equal(b.content, "file-older");
  assert.deepEqual(result.stats, { added: 0, updated: 1, skipped: 1, removed: 0 });
});

test("new: every file prompt becomes a fresh copy with a new id", () => {
  const incoming = lib([p("a", "dup", 10)]);
  const result = backup.plan(current(), incoming, "new", T(20));

  assert.equal(result.prompts.length, 3);
  assert.equal(new Set(result.prompts.map((prompt) => prompt.id)).size, 3);
  assert.equal(result.prompts.filter((prompt) => prompt.content === "dup").length, 1);
  assert.equal(result.prompts.find((prompt) => prompt.id === "a").content, "mine-old");
  assert.equal(result.stats.added, 1);
});

test("replace: the library becomes exactly the file", () => {
  const incoming = lib([p("a", "file-a", 10), p("z", "file-z", 3)]);
  const result = backup.plan(current(), incoming, "replace", T(20));

  assert.deepEqual(result.prompts.map((prompt) => prompt.id).sort(), ["a", "z"]);
  assert.deepEqual(result.stats, { added: 1, updated: 1, skipped: 0, removed: 1 });
});

test("overwriting an existing prompt keeps its old text in history", () => {
  const incoming = lib([p("a", "file-newer", 10)]);
  const result = backup.plan(current(), incoming, "merge", T(20));
  const list = history.get(result.versions, "a");

  assert.ok(list.some((entry) => entry.content === "mine-old" && entry.reason === "before-import"));
  assert.equal(history.latest(list).content, "file-newer");
  assert.equal(result.prompts.find((prompt) => prompt.id === "a").version, history.latest(list).n);
});

test("importing the same file twice changes nothing the second time", () => {
  const incoming = lib([p("a", "file-newer", 10), p("c", "file-new", 3)]);
  const once = backup.plan(current(), incoming, "merge", T(20));
  const twice = backup.plan(once, incoming, "merge", T(30));

  assert.deepEqual(twice.stats, { added: 0, updated: 0, skipped: 2, removed: 0 });
});

test("incoming history is attached to imported prompts and orphans are dropped", () => {
  const incomingVersions = {
    c: [{ n: 1, title: "C", content: "c-old", savedAt: T(1) }, { n: 2, title: "C", content: "c-new", savedAt: T(2) }],
    ghost: [{ n: 1, title: "G", content: "g", savedAt: T(1) }],
  };
  const incoming = lib([p("c", "c-new", 3)], history.sanitizeVersions(incomingVersions).versions);
  const result = backup.plan(current(), incoming, "merge", T(20));

  assert.equal(history.get(result.versions, "c").length, 2);
  assert.equal(result.versions.ghost, undefined);
});

test("planning never mutates its inputs", () => {
  const cur = current();
  const inc = lib([p("a", "file-newer", 10)]);
  const before = JSON.stringify([cur, inc]);
  backup.plan(cur, inc, "replace", T(20));

  assert.equal(JSON.stringify([cur, inc]), before);
});

test("an unknown mode is a programming error, not a silent no-op", () => {
  assert.throws(() => backup.plan(current(), current(), "yolo"), /Unknown import mode/);
});

test("describeStats gives a readable summary", () => {
  assert.equal(backup.describeStats({ added: 2, updated: 1, skipped: 3, removed: 0 }), "2 added, 1 updated, 3 skipped");
  assert.equal(backup.describeStats({ added: 0, updated: 0, skipped: 0, removed: 0 }), "nothing changed");
});

test("every mode listed in MODES can be planned", () => {
  for (const mode of Object.keys(backup.MODES)) {
    assert.doesNotThrow(() => backup.plan(current(), lib([p("q", "x", 1)]), mode, T(20)), mode);
  }
});
