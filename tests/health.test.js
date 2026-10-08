const test = require("node:test");
const assert = require("node:assert/strict");
const health = require("../assets/js/core/health.js");
const history = require("../assets/js/core/history.js");

const find = (report, id) => report.checks.find((entry) => entry.id === id);

test("a healthy library reports ok", () => {
  const report = health.run({
    persistent: true,
    problem: null,
    rawPrompts: [{ id: "a", title: "A", content: "x" }],
    rawVersions: {},
    usage: { total: 1000 },
  });

  assert.equal(report.worst, "ok");
  assert.equal(find(report, "prompts").level, "ok");
});

test("a library that cannot be read is an error and stops further checks", () => {
  const report = health.run({ persistent: true, problem: { code: "corrupt", message: "Broken." } });

  assert.equal(report.worst, "error");
  assert.equal(find(report, "readable").message, "Broken.");
  assert.equal(find(report, "prompts"), undefined);
});

test("private browsing is flagged", () => {
  const report = health.run({ persistent: false, rawPrompts: [], usage: {} });
  assert.equal(find(report, "persistence").level, "warn");
});

test("unusable and duplicate entries are reported", () => {
  const report = health.run({
    persistent: true,
    rawPrompts: [
      { id: "a", title: "A", content: "x" },
      { id: "a", title: "B", content: "y" },
      { title: "", content: "" },
      "garbage",
    ],
    usage: {},
  });

  assert.equal(find(report, "prompts").level, "warn");
  assert.match(find(report, "prompts").message, /2 stored entries/);
  assert.equal(find(report, "duplicates").level, "warn");
});

test("history for deleted prompts and damaged history are reported separately", () => {
  const versions = history.record({}, { id: "gone", title: "G", content: "old" }, { force: true }).versions;
  versions.a = [{ n: 1, title: "A", content: "ok", savedAt: "2026-01-01T00:00:00Z" }, "bad entry"];
  const report = health.run({
    persistent: true,
    rawPrompts: [{ id: "a", title: "A", content: "x" }],
    rawVersions: versions,
    usage: {},
  });

  assert.equal(find(report, "history-orphans").level, "info");
  assert.equal(find(report, "history-damaged").level, "warn");
});

test("storage usage warns early and errors near the limit", () => {
  const base = { persistent: true, rawPrompts: [{ id: "a", title: "A", content: "x" }] };
  const quota = health.ESTIMATED_QUOTA_CHARS;

  assert.equal(find(health.run(Object.assign({ usage: { total: quota * 0.1 } }, base)), "quota").level, "ok");
  assert.equal(find(health.run(Object.assign({ usage: { total: quota * 0.7 } }, base)), "quota").level, "warn");
  assert.equal(find(health.run(Object.assign({ usage: { total: quota * 0.95 } }, base)), "quota").level, "error");
});

test("leftover copies are mentioned but are not warnings", () => {
  const report = health.run({
    persistent: true,
    rawPrompts: [{ id: "a", title: "A", content: "x" }],
    usage: { total: 100, quarantine: 10, safety: 10, legacy: 10 },
  });

  for (const id of ["quarantine", "safety", "legacy"]) assert.equal(find(report, id).level, "info");
  assert.equal(report.worst, "info");
});
