# Security

This page describes the protections that exist **in the code today**, how they are tested, and their limits.
To report a vulnerability, see [../SECURITY.md](../SECURITY.md).

## Threat model

AI Prompt Toolkit is a static page that handles text you type or import. The realistic risks are:

1. A malicious or damaged **import file** (JSON/backup) trying to run code, corrupt your library or exhaust memory.
2. **Prompt text** that looks like HTML or script and gets interpreted as markup (XSS).
3. A **compromised dependency or CDN** — avoided by having none.
4. **Data loss** from bugs, quota limits or damaged storage.

It is not designed to defend against someone with access to your unlocked browser profile (see [PRIVACY.md](PRIVACY.md)).

## Protections

### No markup is ever built from your text

The UI is built with `textContent`, `createTextNode` and `createElement`. The code contains no
`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function` or `document.write`. A scan for
these patterns runs as part of `npm test`, and an end-to-end test saves a prompt containing
`<script>` / `<img onerror>` payloads and asserts they appear as visible text and execute nothing.

### Content Security Policy

`index.html` ships this policy:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self';
connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'self';
form-action 'none'; object-src 'none'
```

There is no `unsafe-inline` and no `unsafe-eval`: inline scripts and inline styles are blocked, and nothing
can load from another origin. The browser tests fail if any CSP violation is reported.

> GitHub Pages cannot send custom HTTP headers, so the policy is delivered as a `<meta>` tag.
> `frame-ancestors` cannot be set that way, so clickjacking protection relies on the host.

### One place for untrusted input

All imported or stored data passes through `assets/js/core/security.js` and then `schema.js`:

| Rule | Limit |
|---|---|
| Largest file parsed | 5 MB |
| Most prompts per import | 5,000 |
| Deepest JSON nesting | 12 levels |
| Keys `__proto__`, `constructor`, `prototype` | removed everywhere, at any depth |
| Control characters | removed from all text |
| Broken UTF-16 (lone surrogates) | replaced with U+FFFD |
| Prompt IDs | must be ≤ 100 characters and not a dangerous key, otherwise replaced |
| Unknown fields | dropped |
| Invisible text-direction overrides | allowed but the import preview warns about them |

### Import is previewed before it changes anything

Choosing a file only *inspects* it. You see the number of prompts, history entries, the data-format version,
the checksum result, and every warning or error. Nothing is saved until you pick a mode and confirm. Before a
"Replace my library" or any overwrite, the current library is saved as a one-slot safety copy.

### Newer data is refused, not damaged

A file from a newer version of the app is rejected with an explanation instead of being "migrated" (which
would silently drop fields). Damaged or newer data **already in storage** locks saving so it cannot be
overwritten by an empty library; you are offered to download it or start with an empty library (the old copy is set aside, not deleted).

### Safe Markdown export

Exported Markdown uses a code fence longer than any run of backticks inside the prompt, so prompt text
cannot break out of its block.

### Links

External links use `target="_blank"` with `rel="noopener noreferrer"`, and the page sends no referrer.

### Service worker

Handles same-origin `GET` requests only. It caches the app's own files and never prompt data. New versions
wait until you click *Update* before taking over, and caches from older versions are deleted afterwards.

## Backup checksum — what it is and isn't

Backups carry a 32-bit FNV-1a checksum of their contents. It detects accidental damage and hand edits.
It is **not** a signature or a security feature: someone can craft a file with a matching checksum. That
is why every file is validated and sanitised whatever its checksum says.

## Known limitations

- **No encryption.** Prompts and backups are stored/exported in plain text. Optional Web Crypto encryption is
  planned but not implemented, and the UI makes no claim otherwise.
- **`localStorage` limits.** About 5 MB per origin, shared with version history. History is trimmed first so
  prompts can always be saved.
- **No lock screen / multi-user separation** within one browser profile.
- **CSP via `<meta>`** cannot cover `frame-ancestors` or report violations to a server (there is no server).

## How it is tested

| Layer | Command | Covers |
|---|---|---|
| Unit | `npm test` | Sanitising, prototype-pollution keys, size/depth limits, malformed JSON, broken Unicode, migrations, import modes, history rules, storage failure and recovery, source scan for unsafe APIs |
| Browser | `npm run test:e2e` | Real Chromium: hostile prompt text, hostile import file, newer-version refusal, offline reload, reset, zero console/page/CSP errors |
