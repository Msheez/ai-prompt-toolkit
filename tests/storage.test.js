const test = require("node:test");
const assert = require("node:assert/strict");
const storage = require("../assets/js/core/storage.js");

/** A tiny stand-in for window.localStorage. */
function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test("an empty browser starts with an empty library", () => {
  const store = storage.createStorage({ backend: fakeStorage() });
  const loaded = store.loadPrompts();

  assert.deepEqual(loaded.prompts, []);
  assert.equal(loaded.migrated, false);
});

test("prompts survive a save and load round trip", () => {
  const backend = fakeStorage();
  const store = storage.createStorage({ backend });

  store.savePrompts([{ id: "a", title: "Saved", content: "body", tags: "x,y" }]);
  const loaded = storage.createStorage({ backend }).loadPrompts();

  assert.equal(loaded.prompts.length, 1);
  assert.equal(loaded.prompts[0].title, "Saved");
  assert.deepEqual(loaded.prompts[0].tags, ["x", "y"]);
});

test("version 1 data is migrated to the new key automatically", () => {
  const backend = fakeStorage({
    "aiPromptToolkit.prompts.v1": JSON.stringify([
      { id: "1", title: "YouTube Video Ideas", category: "Content", tags: "youtube, ai", content: "..." },
    ]),
  });

  const loaded = storage.createStorage({ backend }).loadPrompts();

  assert.equal(loaded.migrated, true);
  assert.equal(loaded.prompts[0].title, "YouTube Video Ideas");
  assert.deepEqual(loaded.prompts[0].tags, ["youtube", "ai"]);
  assert.ok(backend.map.has("aiPromptToolkit.library.v3"), "current key is written");
  assert.ok(backend.map.has("aiPromptToolkit.prompts.v1"), "v1 data is kept as a safety net");

  // Loading again must not report a second migration.
  assert.equal(storage.createStorage({ backend }).loadPrompts().migrated, false);
});

test("corrupted JSON does not break the app and is never overwritten", () => {
  const backend = fakeStorage({ "aiPromptToolkit.library.v3": "{not json" });
  const store = storage.createStorage({ backend });
  const loaded = store.loadLibrary();

  assert.deepEqual(loaded.prompts, []);
  assert.ok(loaded.problem, "the problem is reported");
  assert.equal(store.isLocked(), true);

  // The damaged text must survive: saving is refused instead of replacing it.
  assert.equal(store.savePrompts([{ title: "New", content: "x" }]), false);
  assert.equal(backend.map.get("aiPromptToolkit.library.v3"), "{not json");
});

test("settings round trip and fall back to defaults", () => {
  const backend = fakeStorage();
  const store = storage.createStorage({ backend });

  assert.equal(store.hasSettings(), false);
  assert.deepEqual(store.loadSettings(), storage.DEFAULT_SETTINGS);

  store.saveSettings({ theme: "light" });
  const next = storage.createStorage({ backend });

  assert.equal(next.hasSettings(), true);
  assert.equal(next.loadSettings().theme, "light");
  assert.equal(next.loadSettings().sort, storage.DEFAULT_SETTINGS.sort);
});

test("a storage backend that throws falls back to memory instead of crashing", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };

  const store = storage.createStorage({ backend: broken });

  assert.equal(store.isPersistent, false);
  assert.equal(store.savePrompts([{ title: "A", content: "B" }]), true);
  assert.equal(store.loadPrompts().prompts.length, 1);
});

test("clear removes the library and the settings", () => {
  const backend = fakeStorage();
  const store = storage.createStorage({ backend });

  store.savePrompts([{ title: "A", content: "B" }]);
  store.saveSettings({ theme: "light" });
  store.clear();

  assert.equal(store.loadPrompts().prompts.length, 0);
  assert.equal(store.hasSettings(), false);
});

/* ---- v3.x: history, safety copy, recovery, quota ---------------------- */

const history = require("../assets/js/core/history.js");

test("version history persists separately and survives a reload", () => {
  const backend = fakeStorage();
  const store = storage.createStorage({ backend });
  const prompt = { id: "a", title: "A", content: "now" };
  const versions = history.record({}, prompt, { force: true }).versions;

  store.savePrompts([prompt]);
  assert.equal(store.saveVersions(versions).ok, true);

  const loaded = storage.createStorage({ backend }).loadLibrary();
  assert.equal(history.get(loaded.versions, "a").length, 1);
  assert.equal(loaded.prompts[0].version, 1);
  assert.ok(backend.map.has("aiPromptToolkit.versions.v3"));
});

test("a v2 library migrates once, keeps its source, and reports the upgrade", () => {
  const v2 = JSON.stringify({ app: "ai-prompt-toolkit", schemaVersion: 2, prompts: [{ id: "x", title: "Old", content: "body" }] });
  const backend = fakeStorage({ "aiPromptToolkit.library.v2": v2 });
  const loaded = storage.createStorage({ backend }).loadLibrary();

  assert.deepEqual(loaded.migrated, { from: 2, to: 3, count: 1 });
  assert.equal(loaded.prompts[0].version, 1);
  assert.equal(backend.map.get("aiPromptToolkit.library.v2"), v2, "the v2 source is untouched");
  assert.equal(storage.createStorage({ backend }).loadLibrary().migrated, null, "second load is not a migration");
});

test("data written by a newer app version locks saving and is never overwritten", () => {
  const future = JSON.stringify({ schemaVersion: 99, prompts: [{ title: "Future", content: "x" }] });
  const backend = fakeStorage({ "aiPromptToolkit.library.v3": future });
  const store = storage.createStorage({ backend });
  const loaded = store.loadLibrary();

  assert.equal(loaded.problem.code, "newer");
  assert.equal(store.isLocked(), true);
  assert.equal(store.savePrompts([{ title: "A", content: "B" }]), false);
  assert.equal(store.saveVersions({}).ok, false);
  assert.equal(backend.map.get("aiPromptToolkit.library.v3"), future);
});

test("resolving a problem quarantines the damaged text, then unlocks saving", () => {
  const backend = fakeStorage({ "aiPromptToolkit.library.v3": "{broken" });
  const store = storage.createStorage({ backend });
  store.loadLibrary();

  assert.equal(store.readProblemRaw(), "{broken");
  assert.equal(store.resolveProblem().ok, true);
  assert.equal(store.isLocked(), false);
  assert.equal(store.readQuarantine().raw, "{broken");
  assert.equal(store.savePrompts([{ title: "Fresh", content: "x" }]), true);
});

test("a damaged history file resets history but keeps the prompts", () => {
  const backend = fakeStorage();
  const store = storage.createStorage({ backend });
  store.savePrompts([{ id: "a", title: "A", content: "x" }]);
  backend.setItem("aiPromptToolkit.versions.v3", "{broken");

  const loaded = storage.createStorage({ backend }).loadLibrary();
  assert.equal(loaded.prompts.length, 1);
  assert.deepEqual(loaded.versions, {});
  assert.ok(loaded.warnings.some((warning) => /version history/.test(warning)));
  assert.equal(JSON.parse(backend.map.get("aiPromptToolkit.quarantine.v3")).raw, "{broken");
});

test("when the quota is tight, history is trimmed so prompts can still be saved", () => {
  const backend = fakeStorage();
  const limit = 2500; // smaller than the 8-entry history (~3000 chars) so the first write must fail
  const realSet = backend.setItem;
  backend.setItem = (key, value) => {
    const others = [...backend.map].filter(([k]) => k !== key).reduce((sum, [, v]) => sum + v.length, 0);
    if (others + String(value).length > limit) throw new Error("QuotaExceededError");
    return realSet(key, value);
  };

  const store = storage.createStorage({ backend });
  let versions = {};
  for (let i = 0; i < 8; i += 1) {
    versions = history.record(versions, { id: "a", title: "A", content: "y".repeat(200) + i }, { force: true, now: new Date(2026, 0, 1, 0, i).toISOString() }).versions;
  }
  const saved = store.saveVersions(versions);

  assert.equal(saved.ok, true);
  assert.equal(saved.trimmed, true);
  assert.ok(history.get(saved.versions, "a").length < 8);
  assert.equal(store.savePrompts([{ id: "a", title: "A", content: "z".repeat(300) }]), true);
});

test("a safety copy can be saved, read back and cleared", () => {
  const store = storage.createStorage({ backend: fakeStorage() });
  assert.equal(store.loadSafety(), null);

  store.saveSafety({ prompts: [{ id: "a", title: "A", content: "kept" }], versions: {} }, "replace");
  const safety = store.loadSafety();

  assert.equal(safety.prompts[0].content, "kept");
  assert.equal(safety.reason, "replace");

  store.clearSafety();
  assert.equal(store.loadSafety(), null);
});

test("clear removes every key this app wrote, including old formats", () => {
  const backend = fakeStorage({ "aiPromptToolkit.prompts.v1": "[]", "aiPromptToolkit.library.v2": "{}", unrelated: "keep" });
  const store = storage.createStorage({ backend });
  store.savePrompts([{ title: "A", content: "B" }]);
  store.saveVersions({});
  store.saveSafety({ prompts: [], versions: {} });
  store.saveSettings({ theme: "light" });
  store.clear();

  assert.deepEqual([...backend.map.keys()], ["unrelated"], "other sites' keys on a shared origin are not touched");
});

test("usage reports how much each area stores", () => {
  const store = storage.createStorage({ backend: fakeStorage() });
  store.savePrompts([{ title: "A", content: "B" }]);
  const usage = store.usage();

  assert.ok(usage.library > 0);
  assert.equal(usage.total, usage.library + usage.versions + usage.safety + usage.quarantine + usage.legacy);
});

test("dropLegacy removes only the old copies", () => {
  const backend = fakeStorage({ "aiPromptToolkit.prompts.v1": "[]", "aiPromptToolkit.library.v2": "{}" });
  const store = storage.createStorage({ backend });
  store.savePrompts([{ title: "A", content: "B" }]);
  store.dropLegacy();

  assert.equal(backend.map.has("aiPromptToolkit.prompts.v1"), false);
  assert.equal(backend.map.has("aiPromptToolkit.library.v2"), false);
  assert.equal(backend.map.has("aiPromptToolkit.library.v3"), true);
});
