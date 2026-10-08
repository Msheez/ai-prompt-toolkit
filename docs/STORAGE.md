# Storage, history and backups

## Where data lives

All data is in the browser's `localStorage`. See [PRIVACY.md](PRIVACY.md) for the full list of keys.

> **Honest note about IndexedDB.** The long-term plan is IndexedDB, which has far larger quotas.
> v3.2 deliberately keeps `localStorage`: the whole storage layer sits behind `createStorage()` in
> `assets/js/core/storage.js`, so the app never touches `localStorage` directly and the backend can be swapped
> later without UI changes. Until then the practical limit is roughly 5 MB per browser origin.

## Schema versions

| Version | Format |
|---|---|
| 1 | Original release: a bare array of prompts, `tags` as a string |
| 2 | `{ prompts: [...] }` envelope, tag arrays, favourites, usage counts |
| 3 | Prompts carry a `version` number; version history is stored beside them; backups exist |

Data from every earlier version is upgraded automatically on first load, one step at a time
(`assets/js/core/migrations.js`). **Migration never deletes the source**: old v1/v2 keys are left in the browser
until you choose to remove them. Adding version 4 later means bumping `SCHEMA_VERSION`, adding one step,
and adding a test.

## Version history

Every prompt keeps up to **25** snapshots of its title, category, tags, note and text.

- **Explicit saves** (Save button, `Ctrl+S`) always create a new version.
- **Autosave** updates the newest version in place while it is an autosave less than five minutes old, so
  typing does not flood the history.
- **Restoring** an old version first records the current text, then writes the restored text as a *new*
  version. Nothing is overwritten; you can always go back.
- You can **compare** any version with the current text (line diff plus changed fields) and **delete** old
  versions. The newest version cannot be deleted.
- A total budget (about 1.2 million characters across all prompts) keeps history inside the browser quota. The
  oldest entries go first and the newest entry of every prompt is always kept. If storage is tight, history is
  trimmed before prompts are.

## Backups

**Settings → Backup & restore → Create full backup** creates a JSON file with prompts, version history, a few
settings, the data-format version and a checksum. **Export as JSON / Markdown** from the Library menu
creates prompts-only files.

### Import modes

| Mode | Result |
|---|---|
| Merge | Keep everything; replace a prompt that exists in both only if the file's copy is newer |
| Add new only | Add prompts you don't have; leave existing prompts untouched |
| Update existing only | Overwrite prompts that exist in both; ignore prompts only in the file |
| Import as new copies | Add every prompt as a brand-new prompt |
| Replace my library | Use only what's in the file; a safety copy is kept so you can undo |

Whenever an existing prompt is overwritten its previous text is first recorded in its history, so an import can
be walked back from the History tab.

## Recovery and health

- **Health check** (Settings → Storage & health) is read-only. It reports whether browser storage is writable,
  whether the saved library can be read, unusable or duplicate entries, damaged or orphaned history, how full
  the browser storage is, and whether a safety copy, set-aside copy or old-format copy exists.
- If the saved library is **damaged or from a newer version**, saving is paused and a banner appears so nothing
  is overwritten. **Download the saved data** gives you the raw text; **Start with an empty library** sets the
  damaged copy aside (it is kept, not deleted) and unlocks saving.
- **Reset** requires typing `DELETE` and removes everything the app stored.
