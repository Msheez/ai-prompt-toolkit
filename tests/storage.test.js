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
  assert.ok(backend.map.has("aiPromptToolkit.library.v2"), "v2 key is written");
  assert.ok(backend.map.has("aiPromptToolkit.prompts.v1"), "v1 data is kept as a safety net");

  // Loading again must not report a second migration.
  assert.equal(storage.createStorage({ backend }).loadPrompts().migrated, false);
});

test("corrupted JSON is ignored instead of breaking the app", () => {
  const backend = fakeStorage({ "aiPromptToolkit.library.v2": "{not json" });
  assert.deepEqual(storage.createStorage({ backend }).loadPrompts().prompts, []);
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
