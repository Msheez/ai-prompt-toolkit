# Security policy

## Supported versions

The live site always tracks the `main` branch. Only the latest version is
supported — there are no long-lived release branches.

| Version | Supported |
|---|---|
| 2.x (current) | ✅ |
| 1.x | ❌ upgrade by opening the app once; your prompts migrate automatically |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

1. Use GitHub's private reporting: **Security → Report a vulnerability** on
   [this repository](https://github.com/Msheez/ai-prompt-toolkit/security/advisories/new).
2. Include what you found, how to reproduce it, and the impact you think it has.
3. You will get an acknowledgement within a few days, and credit in the
   changelog when a fix ships (unless you would rather stay anonymous).

## Threat model

The toolkit is a static site with no backend, no accounts and no network calls
after the page loads. That rules out whole categories of risk, but a few things
still matter:

| Risk | Mitigation |
|---|---|
| Stored XSS via prompt text | The app never uses `innerHTML` with user data. Every node is created with `document.createElement` and filled with `textContent`, including search highlighting. |
| Malicious import file | Imports are parsed, validated and normalised by `schema.parseExport`; unknown fields are dropped, strings are length-capped, and a bad file produces an error toast rather than corrupt state. |
| Prompt data leaking | Prompts never leave `localStorage`. There is no analytics, no telemetry, no outbound request, and no third-party script or font. |
| Corrupt storage breaking the app | Unreadable JSON is ignored and the library starts empty instead of the page failing to boot. |
| Supply chain | Zero runtime dependencies and zero build dependencies. CI uses pinned, first-party GitHub Actions only. |

## What is explicitly *not* protected

- **Anyone with access to your browser profile can read your prompts.** They are
  stored unencrypted in `localStorage`, like any other site's data. Do not store
  secrets, credentials or API keys in a prompt.
- **Clearing site data deletes your library.** Export a backup first.
- Shared or public computers are not a supported use case.

## Future features

Any future AI provider integration (roadmap v6) will keep API keys local, make
the behaviour opt-in and obvious, and document exactly what is sent where. A
key will never be committed, bundled or proxied through a server the project
controls.
