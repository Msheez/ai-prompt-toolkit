<div align="center">

![AI Prompt Toolkit](docs/assets/banner.svg)

**A fast, local-first prompt library that runs entirely in your browser.**
Save the prompts that actually work, find them in a keystroke, turn them into reusable templates.

[**Open the live app →**](https://msheez.github.io/ai-prompt-toolkit/)

[![CI](https://github.com/Msheez/ai-prompt-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/Msheez/ai-prompt-toolkit/actions/workflows/ci.yml)
[![Live site](https://img.shields.io/badge/demo-GitHub%20Pages-7c8dff)](https://msheez.github.io/ai-prompt-toolkit/)
[![License: MIT](https://img.shields.io/badge/license-MIT-ffc857)](LICENSE)
[![Dependencies: 0](https://img.shields.io/badge/dependencies-0-3ddc97)](package.json)
[![Tests](https://img.shields.io/badge/tests-58%20unit-b06bff)](tests)

</div>

---

## Why this exists

Good prompts end up scattered across notepads, chat histories, WhatsApp messages and
browser bookmarks — and then you rewrite them from memory. The AI Prompt Toolkit gives
them one home: a searchable library that opens instantly, works offline, and never sends
your prompts anywhere.

No account. No server. No tracking. No build step.

## Features

| | |
|---|---|
| 🔎 **Search that finds things** | One box searches titles, prompt text, categories and tags at once, ranks the best matches first, and highlights them in the results. Quoted `"exact phrases"` are supported. |
| 🧮 **Filters that stack** | Search **+** category **+** multiple tags **+** favourites, all combined with AND — plus a live result count and one-click **Clear filters**. |
| ⭐ **Favourites** | Star the prompts you reach for daily and filter down to them instantly. |
| 🧩 **Template variables** | Write `{{topic}}` or `{{tone|friendly}}` in a prompt, fill the blanks in the Preview tab, and copy the finished text. |
| 💾 **Autosave** | Changes are written to the browser as you type, with a visible save state. |
| ↩️ **Undo delete** | Deleting shows an undo toast for seven seconds instead of an unrecoverable confirm box. |
| ⌨️ **Keyboard first** | <kbd>Ctrl</kbd>+<kbd>K</kbd> command palette, <kbd>/</kbd> to search, <kbd>Ctrl</kbd>+<kbd>S</kbd> to save, <kbd>?</kbd> for the full list. |
| 📦 **Import / export** | Versioned JSON backups (drag a `.json` file anywhere on the page to import) and a readable Markdown export. |
| 🌓 **Dark & light themes** | Follows your system preference on first visit, then remembers your choice. |
| 📱 **Responsive** | Two-pane desktop layout collapses into a list ⇄ editor flow on phones. |
| 🔒 **Private by design** | Everything lives in `localStorage`. The app makes zero network requests after loading. |

## Quick start

The app is plain HTML, CSS and JavaScript — there is nothing to install.

```bash
git clone https://github.com/Msheez/ai-prompt-toolkit.git
cd ai-prompt-toolkit
npm start            # serves http://localhost:8000 (Node 18+, no dependencies)
```

Prefer not to use Node? Any static server works, or just open `index.html` directly:

```bash
python -m http.server 8000
```

First run: click **Load 8 starter prompts** to see the toolkit with real content.

## Usage

<details>
<summary><strong>Create and organise prompts</strong></summary>

1. Click **New prompt** (or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>).
2. Give it a title, a category and a few comma-separated tags.
3. Write the prompt. It saves itself as you type.
4. Star it if it is one of your regulars.
</details>

<details>
<summary><strong>Turn a prompt into a reusable template</strong></summary>

Write placeholders in double braces, with an optional default after a pipe:

```text
Write a YouTube script about {{topic}}
for {{audience|complete beginners}}
in a {{tone}} tone.
```

Open the **Preview** tab, fill in the fields, and click **Copy filled**. The original
prompt keeps its placeholders, so you can reuse it forever.
</details>

<details>
<summary><strong>Back up and move your prompts</strong></summary>

**Library → Export as JSON** downloads a versioned backup. **Import JSON** merges a
backup back in: prompts with the same id are kept at whichever copy was updated most
recently, so importing twice never creates duplicates. You can also drag a `.json` file
anywhere onto the page.
</details>

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Command palette | <kbd>Ctrl</kbd>+<kbd>K</kbd> |
| New prompt | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> |
| Focus search | <kbd>/</kbd> |
| Save | <kbd>Ctrl</kbd>+<kbd>S</kbd> |
| Copy prompt | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> |
| Toggle favourite | <kbd>Ctrl</kbd>+<kbd>D</kbd> |
| Clear filters | <kbd>Esc</kbd> |
| Shortcut help | <kbd>?</kbd> |

## Project structure

```text
ai-prompt-toolkit/
├── index.html                  # the entire UI (markup + icon sprite)
├── assets/
│   ├── css/                    # design tokens → base → components → layout
│   └── js/
│       ├── core/               # pure, unit-tested logic (no DOM)
│       │   ├── schema.js       #   prompt shape, import/export, migration
│       │   ├── search.js       #   filtering, ranking, sorting, highlighting
│       │   ├── variables.js    #   {{placeholder}} templates
│       │   ├── library.js      #   add / edit / delete / duplicate / stats
│       │   ├── storage.js      #   localStorage with a memory fallback
│       │   └── starter-prompts.js
│       └── app.js              # the only file that touches the DOM
├── tests/                      # node --test, zero dependencies
├── scripts/                    # dev server + no-build sanity checks
└── docs/                       # architecture, user flow, roadmap
```

The rule that keeps this maintainable: **`core/` never touches the DOM, `app.js` never
makes decisions.** That is what makes 58 unit tests possible without a browser or a
testing framework.

📖 [Architecture & file map](docs/ARCHITECTURE.md) · 🧭 [End-to-end user flow](docs/USER-FLOW.md) · 🗺️ [Roadmap](docs/ROADMAP.md)

## Development

```bash
npm test          # 58 unit tests (node:test, no dependencies)
npm run check     # verifies asset paths, icon ids and element ids, then tests
npm start         # local dev server on :8000
```

Every push and pull request runs the same commands on Node 18, 20 and 22 via
[GitHub Actions](.github/workflows/ci.yml).

## Roadmap

| Version | Status | Highlights |
|---|---|---|
| v1 | ✅ Shipped | CRUD, categories, tags, search, copy, import/export |
| v2 | ✅ Shipped | Multi-field ranked search, stacked filters, clear filters, result counts |
| v3 | ✅ Shipped | Favourites, sorting, tag filtering, duplicate, undo delete, stats |
| v4 | ✅ Shipped | Template variables, live preview, command palette, themes, Markdown export |
| v5 | 🔜 Next | Folders, bulk actions, prompt version history, offline install (PWA) |
| v6 | 💭 Planned | Optional AI provider integration through a proxy (never a key in the frontend) |
| v7 | 💭 Planned | Accounts, cloud sync, shared community prompt packs |

The full reasoning behind each stage lives in [docs/ROADMAP.md](docs/ROADMAP.md).

## Contributing

Pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow,
coding conventions and how to add a test. Bug reports and feature ideas go in
[Issues](https://github.com/Msheez/ai-prompt-toolkit/issues/new/choose).

## Privacy

The toolkit stores prompts in your browser's `localStorage` under
`aiPromptToolkit.library.v2`. It has no analytics, no cookies and no outbound requests.
Clearing site data deletes your prompts, so export a backup before you do.

## License

[MIT](LICENSE) © Msheez and contributors.
