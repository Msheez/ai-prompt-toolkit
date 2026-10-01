# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project uses [Semantic Versioning](https://semver.org/).

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

[2.0.0]: https://github.com/Msheez/ai-prompt-toolkit/releases/tag/v2.0.0
[1.0.0]: https://github.com/Msheez/ai-prompt-toolkit/releases/tag/v1.0.0
