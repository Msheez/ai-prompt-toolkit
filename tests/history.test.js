const test = require("node:test");
const assert = require("node:assert/strict");
const history = require("../assets/js/core/history.js");

const T0 = "2026-01-01T10:00:00.000Z";
const at = (minutes) => new Date(Date.parse(T0) + minutes * 60000).toISOString();
const prompt = (content, extra) => Object.assign({ id: "p1", title: "T", content, category: "C", tags: ["a"] }, extra);

test("the first change to an existing prompt keeps the original text", () => {
  const before = prompt("original");
  const after = prompt("edited");
  const { versions } = history.record({}, after, { previous: before, force: true, now: at(1) });
  const list = history.get(versions, "p1");

  assert.equal(list.length, 2);
  assert.equal(list[0].content, "original");
  assert.equal(list[0].reason, "baseline");
  assert.equal(list[1].content, "edited");
  assert.deepEqual(list.map((entry) => entry.n), [1, 2]);
});

test("an unchanged prompt does not create a new version", () => {
  let result = history.record({}, prompt("same"), { force: true, now: at(0) });
  result = history.record(result.versions, prompt("same"), { force: true, now: at(1) });

  assert.equal(result.changed, false);
  assert.equal(history.get(result.versions, "p1").length, 1);
});

test("autosaves inside five minutes update one entry instead of flooding the list", () => {
  let versions = history.record({}, prompt("a"), { now: at(0) }).versions;
  versions = history.record(versions, prompt("ab"), { now: at(1) }).versions;
  versions = history.record(versions, prompt("abc"), { now: at(2) }).versions;
  const list = history.get(versions, "p1");

  assert.equal(list.length, 1);
  assert.equal(list[0].content, "abc");
});

test("an autosave after the window starts a new entry", () => {
  let versions = history.record({}, prompt("a"), { now: at(0) }).versions;
  versions = history.record(versions, prompt("b"), { now: at(10) }).versions;

  assert.equal(history.get(versions, "p1").length, 2);
});

test("an explicit save always gets its own entry", () => {
  let versions = history.record({}, prompt("a"), { now: at(0) }).versions;
  versions = history.record(versions, prompt("b"), { force: true, now: at(1) }).versions;
  versions = history.record(versions, prompt("c"), { force: true, now: at(2) }).versions;

  assert.equal(history.get(versions, "p1").length, 3);
  assert.equal(history.latest(history.get(versions, "p1")).reason, "save");
});

test("only the newest 25 versions are kept, with increasing numbers", () => {
  let versions = {};
  for (let i = 0; i < 40; i += 1) {
    versions = history.record(versions, prompt(`v${i}`), { force: true, now: at(i) }).versions;
  }
  const list = history.get(versions, "p1");

  assert.equal(list.length, history.LIMITS.maxVersions);
  assert.equal(list[list.length - 1].content, "v39");
  assert.equal(list[list.length - 1].n, 40);
});

test("restoring is non-destructive: the current text becomes a version first", () => {
  let versions = history.record({}, prompt("old"), { force: true, now: at(0) }).versions;
  versions = history.record(versions, prompt("current"), { force: true, now: at(1) }).versions;

  const target = history.find(versions, "p1", 1);
  const restored = history.fieldsForRestore(target);
  // This mirrors what the app does: snapshot the current text, then apply and record.
  versions = history.record(versions, prompt("current"), { force: true, reason: "before-restore", now: at(2) }).versions;
  versions = history.record(versions, prompt(restored.content), { force: true, reason: "restore", now: at(3) }).versions;
  const list = history.get(versions, "p1");

  assert.ok(list.some((entry) => entry.content === "current"), "the pre-restore text is still in history");
  assert.equal(history.latest(list).content, "old");
  assert.equal(history.latest(list).reason, "restore");
});

test("the newest version cannot be deleted, older ones can", () => {
  let versions = {};
  for (let i = 0; i < 3; i += 1) {
    versions = history.record(versions, prompt(`v${i}`), { force: true, now: at(i) }).versions;
  }

  const refused = history.remove(versions, "p1", 3);
  assert.equal(refused.removed, false);
  assert.equal(refused.reason, "latest");

  const ok = history.remove(versions, "p1", 1);
  assert.equal(ok.removed, true);
  assert.deepEqual(history.get(ok.versions, "p1").map((entry) => entry.n), [2, 3]);
  assert.equal(history.remove(versions, "p1", 99).removed, false);
});

test("history for deleted prompts is pruned", () => {
  const versions = history.record({}, prompt("a"), { force: true, now: at(0) }).versions;
  const result = history.pruneOrphans(versions, [{ id: "other" }]);

  assert.deepEqual(result.versions, {});
  assert.equal(result.removed, 1);
});

test("the size budget drops the oldest entries but keeps each prompt's newest", () => {
  let versions = {};
  for (let i = 0; i < 10; i += 1) {
    versions = history.record(versions, prompt("x".repeat(500) + i), { force: true, now: at(i) }).versions;
  }
  const result = history.enforceBudget(versions, 1500);

  assert.ok(result.dropped > 0);
  const list = history.get(result.versions, "p1");
  assert.equal(history.latest(list).content.endsWith("9"), true);
  assert.ok(history.totalChars(result.versions) <= 1500 + 700, "close to the budget");
});

test("sanitizeVersions drops damaged entries and renumbers", () => {
  const dirty = {
    p1: [
      { n: 5, title: "A", content: "one", savedAt: at(0) },
      null,
      "garbage",
      { n: 5, title: "B", content: "two", savedAt: at(1) },
      { n: -1, title: "", content: "" },
    ],
    __proto__: [{ title: "x", content: "y" }],
    [`k${"x".repeat(200)}`]: [{ title: "x", content: "y" }],
    p2: "not an array",
  };
  const { versions, dropped } = history.sanitizeVersions(dirty);

  assert.deepEqual(Object.keys(versions), ["p1"]);
  assert.deepEqual(versions.p1.map((entry) => entry.n), [5, 6]);
  assert.ok(dropped >= 3);
  assert.equal(({}).content, undefined);
});

test("sanitizeVersions rejects non-object input", () => {
  for (const input of [null, [], "x", 5]) {
    assert.deepEqual(history.sanitizeVersions(input).versions, {});
  }
});

test("diffLines marks added, removed and unchanged lines", () => {
  const diff = history.diffLines("a\nb\nc", "a\nB\nc\nd");

  assert.equal(diff.added, 2);
  assert.equal(diff.removed, 1);
  assert.deepEqual(
    diff.ops.map((op) => `${op.type}:${op.text}`),
    ["same:a", "del:b", "add:B", "same:c", "add:d"]
  );
});

test("diffLines handles empty sides and identical text", () => {
  assert.equal(history.diffLines("", "x\ny").added, 2);
  assert.equal(history.diffLines("x\ny", "").removed, 2);
  const same = history.diffLines("x\ny", "x\ny");
  assert.equal(same.added + same.removed, 0);
});

test("diffEntries reports metadata changes separately from text", () => {
  const diff = history.diffEntries(
    { title: "Old", content: "same", tags: ["a"], category: "X" },
    { title: "New", content: "same", tags: ["a", "b"], category: "X" }
  );

  assert.deepEqual(diff.fields.map((field) => field.field), ["title", "tags"]);
  assert.equal(diff.lines.added + diff.lines.removed, 0);
  assert.equal(diff.changed, true);
});

test("collapse hides long unchanged stretches", () => {
  const ops = [];
  for (let i = 0; i < 20; i += 1) ops.push({ type: "same", text: `l${i}` });
  ops.splice(10, 0, { type: "add", text: "new" });
  const collapsed = history.collapse(ops, 2);

  assert.ok(collapsed.some((op) => op.type === "skip"));
  assert.ok(collapsed.length < ops.length);
  assert.ok(collapsed.some((op) => op.type === "add"));
});

test("syncVersionNumbers sets each prompt's version from its history", () => {
  const versions = {};
  let next = versions;
  for (let i = 0; i < 3; i += 1) next = history.record(next, prompt(`v${i}`), { force: true, now: at(i) }).versions;
  const result = history.syncVersionNumbers([{ id: "p1", version: 1 }, { id: "p2" }], next);

  assert.equal(result[0].version, 3);
  assert.equal(result[1].version, 1);
});

test("mergeLists combines two histories without duplicating identical text", () => {
  const a = [{ n: 1, savedAt: at(0), title: "T", category: "C", tags: [], notes: "", content: "one" }];
  const b = [
    { n: 1, savedAt: at(1), title: "T", category: "C", tags: [], notes: "", content: "one" },
    { n: 2, savedAt: at(2), title: "T", category: "C", tags: [], notes: "", content: "two" },
  ];
  const merged = history.mergeLists(a, b);

  assert.deepEqual(merged.map((entry) => entry.content), ["one", "two"]);
  assert.deepEqual(merged.map((entry) => entry.n), [1, 2]);
});
