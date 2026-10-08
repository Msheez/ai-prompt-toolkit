# Deployment

The site is published to **https://msheez.github.io/ai-prompt-toolkit/** by GitHub Actions.

## One-time repository setting

In the repository: **Settings → Pages → Build and deployment → Source → GitHub Actions.**
Without this, the workflow runs but nothing is published.

## The pipeline

`.github/workflows/deploy.yml` runs on every push to `main` (and on demand from the Actions tab):

```
unit tests → HTML/asset checks → build → verify the built site → deploy
```

Each stage must pass before the next starts, so a broken build is never published.

| Stage | Command | Fails when |
|---|---|---|
| Unit tests | `npm test` | Any test fails, or versions disagree between `package.json`, `schema.js`, `sw.js` and the footer |
| Checks | `node scripts/check-html.js` | A referenced file is missing, an icon is undefined, or the JS reads an element id that isn't in the HTML |
| Build | `npm run build` | The service-worker precache list or `index.html` references a file that isn't in `dist/` |
| Verify | `SERVE_DIR=dist node scripts/verify-site.js` | The built site doesn't serve any required file |
| Deploy | `actions/deploy-pages` | Pages is not configured |

`ci.yml` separately runs the tests on Node 18, 20 and 22 for every push and pull request.

## Base-path safety

Pages serves the app from `/ai-prompt-toolkit/`, not `/`. Every asset URL, the manifest `start_url`/`scope`
and the service worker use relative paths so the same files work at any base path.

## Releasing a new version

1. Change the version in **all four places**: `package.json`, `APP_VERSION` in `assets/js/core/schema.js`,
   `VERSION` in `sw.js`, and the footer in `index.html`. A test fails if they disagree.
2. Add a `CHANGELOG.md` entry.
3. Open a pull request. When CI is green, merge it. The deploy workflow publishes automatically.

The service-worker cache name contains the version, so users get the new files on their next visit and see an
*Update available* button; nothing changes under them until they click it.

## Local commands

```bash
npm start            # dev server on http://localhost:8000
npm test             # unit tests
npm run check        # HTML checks + unit tests
npm run build        # writes dist/
npm run verify:site  # serve the site and request every file
npm run test:e2e     # real-browser tests (needs Playwright + Chromium)
```
