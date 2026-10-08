# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project uses [Semantic Versioning](https://semver.org/).

## [3.2.0] — 2026-10-08

The release that takes the app from v2.0 to a hardened, offline-capable, deployable v3.2.
It contains the v3.0, v3.1 and v3.2 milestones. Existing libraries are upgraded
automatically on first load and the old data is left in place.

### Added

**Version history (v3.0)**
- Every prompt keeps up to 25 versions; explicit saves always create one, autosave is coalesced
- History tab: line-by-line diff against the current text, restore, delete old versions
- Restoring first records the current text, so it can always be undone

**Backup, import and migration (v3.1)**
- Full backup file with prompts, history, selected settings and a checksum
- Import preview (counts, warnings, errors) before anything changes
- Five import modes: merge, add new only, update existing only, import as copies, replace
- One-slot safety copy before risky imports, with restore
- Migration ladder v1 → v2 → v3 that never deletes the source; data from a newer version is refused
- Storage recovery: saving pauses on damaged/newer data, raw download, set-aside copy
- Read-only health check and a reset that requires typing `DELETE`
- Settings & data dialog

**Security, privacy and production (v3.2)**
- `security.js`: one place for size, depth, prototype-key, control-character and Unicode checks
- Strict Content Security Policy (no inline code, no foreign origins) and `no-referrer`
- Service worker, web app manifest and icons: installable, works offline, updates only on request
- `deploy.yml`: test → check → build → verify → deploy to GitHub Pages
- `npm run build`, `verify:site` and `test:e2e` (13 real-browser checks)
- `docs/PRIVACY.md`, `SECURITY.md`, `STORAGE.md`, `DEPLOYMENT.md`; roadmap rewritten as a feature matrix
- Release tests that enforce matching versions, a complete offline file list, no unsafe APIs and no network calls

### Changed
- Data schema is now version 3 (prompts carry a `version` number); exports and backups record `schemaVersion` and `appVersion`
- Storage keys moved to `*.v3`; the previous `*.v2` and `*.v1` keys are kept until you remove them
- Markdown export uses a code fence longer than any backtick run in the prompt
- Unit tests grew from 58 to 149

### Security
- Imported keys `__proto__`, `constructor` and `prototype` are removed at any depth
- Prompt ids that are over-long or dangerous are replaced
- Control characters and broken UTF-16 are removed or repaired on input

### Known limitations
- Storage is still `localStorage` (about 5 MB). IndexedDB is planned for v3.4
- No encryption: prompts and backups are plain text
- No archive, collections or CSV/TXT import yet (see the roadmap)

## [2.0.0] — 2026-10-01

A rebuild of the app around a tested core, plus the v2, v3 and v4 roadmap
features. Existing prompts are migrated automatically on first load.

### Added

**Search and filtering (roadmap v2)**
- Search now covers title, prompt text, category and tags in one box
- Relevance ranking — title matches outrank tag matches, which outrank body matches
- Quoted `"exact phrases"` and multi-word AND search
- Matched terms are highlighted in the result list
- Category, multi-tag and favourites filters that stack with the search
- Live result count and a one-line summary of the active filters
- **Clear filters** button and <kbd>Esc</kbd> shortcut

**Organising (roadmap v3)**
- ⭐ Favourites with a favourites-only filter
- Clickable tag chips with counts
- Sorting: recently updated, recently created, title A–Z, most used
- Duplicate a prompt
- Delete with a 7-second **Undo** toast
- Library statistics: prompts, categories, tags, starred
- Optional eight-prompt starter pack for new libraries

**Templates and workflow (roadmap v4)**
- `{{variable}}` placeholders with inline defaults (`{{tone|friendly}}`)
- Preview tab with one field per placeholder, live filled output, and colour-coded filled/missing values
- "Copy filled" with a warning when placeholders are still blank, plus a per-prompt usage counter
- <kbd>Ctrl</kbd>+<kbd>K</kbd> command palette for jumping to prompts and running actions
- Full keyboard shortcut set and an in-app shortcut dialog
- Autosave with a visible save state, and an unsaved-changes guard when closing the tab
- Markdown export alongside the JSON export
- Drag and drop a `.json` backup anywhere on the page to import
- Dark and light themes, following the system preference on first visit
- Deep links: the selected prompt is reflected in the URL hash
- An optional note field per prompt

**Engineering**
- Logic split into six pure, dependency-free `core/` modules that run in both the browser and Node
- 58 unit tests with the built-in `node:test` runner — no test framework, no dependencies
- `npm run check`: verifies asset paths, icon sprite ids and element ids, catching the mistakes a bundler would normally catch
- GitHub Actions CI on Node 18, 20 and 22
- `npm start`: a dependency-free static dev server
- Documentation: architecture and file map, end-to-end user flow, roadmap, contributing guide, security policy, code of conduct, issue and pull request templates

### Changed

- Complete visual redesign: design-token system, dark/light themes, new layout, icon set, toasts and dialogs
- Storage moved from `aiPromptToolkit.prompts.v1` to a versioned envelope at `aiPromptToolkit.library.v2`; v1 data is migrated on first load and the old key is kept as a safety net
- `tags` is now an array instead of a comma-separated string (old backups still import correctly)
- Import merges by id and keeps whichever copy was updated most recently, so importing twice no longer creates duplicates
- `alert()` and `confirm()` replaced with toasts and a proper dialog
- Prompt cards now show an excerpt, category, tags, a template badge and a relative timestamp

### Fixed

- The app no longer breaks when `localStorage` is unavailable (private mode, blocked cookies, sandboxed iframes) — it falls back to memory and warns the user
- Corrupt stored JSON no longer produces a blank page
- Clipboard copy now falls back to a hidden textarea when the async Clipboard API is blocked (for example on `file://`)
- Importing a malformed file reports what is wrong instead of a generic failure
- Overlong titles, categories and tags are clipped rather than silently stored
- Background re-renders can no longer overwrite text that is being typed
- Abandoned "New prompt" drafts no longer leave empty entries in the library

## [1.0.0] — 2026-09

Initial release.

### Added
- Create, edit and delete prompts
- Categories and comma-separated tags
- Single-field search and a category dropdown
- Copy to clipboard
- JSON import and export
- `localStorage` persistence
- Published to GitHub Pages

[3.2.0]: https://github.com/Msheez/ai-prompt-toolkit/releases/tag/v3.2.0
[2.0.0]: https://github.com/Msheez/ai-prompt-toolkit/releases/tag/v2.0.0
[1.0.0]: https://github.com/Msheez/ai-prompt-toolkit/releases/tag/v1.0.0
