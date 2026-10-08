# Privacy

AI Prompt Toolkit is built so that **your prompts never leave your device unless you move them yourself.**

## What is stored, and where

Everything is stored in your browser, on your device, for this site's address only.

| Data | Where | Why |
|---|---|---|
| Your prompts | Browser `localStorage` (`aiPromptToolkit.library.v3`) | The library itself |
| Version history | Browser `localStorage` (`aiPromptToolkit.versions.v3`) | Lets you compare and restore earlier text |
| Settings (theme, sort order, last backup date) | Browser `localStorage` (`aiPromptToolkit.settings.v2`) | Remembers your choices |
| One safety copy | Browser `localStorage` (`aiPromptToolkit.safety.v3`) | Lets you undo a "replace my library" import |
| Damaged data you set aside | Browser `localStorage` (`aiPromptToolkit.quarantine.v3`) | Kept so nothing is destroyed silently |
| Old v1/v2 data | Browser `localStorage` | Left in place after an upgrade until you remove it |
| The app's own files | Service worker cache (`ai-prompt-toolkit-<version>`) | Lets the app open offline. Contains code and icons, never prompts |

## What is *not* done

- No account, login or sign-up.
- No analytics, telemetry, tracking pixels or advertising.
- No cookies.
- No server of ours receives anything. The site is static files on GitHub Pages.
- No third-party scripts, fonts, images or stylesheets. The page's
  [Content Security Policy](SECURITY.md#content-security-policy) enforces this: the browser
  refuses any request that is not to the site's own address.
- No API keys are stored anywhere. There are no AI features in this version.

## What can leave your device

Only things you explicitly do:

- **Export / Create a backup** — creates a file in your downloads folder.
- **Copy** — puts text on your clipboard.
- **Opening a link** to GitHub from the footer. These links use `rel="noopener noreferrer"` and the page
  sends no referrer.

GitHub Pages, like any web host, can see that your browser requested the page (your IP address and the
usual request details). That is how all websites work and it never includes your prompts, which are
never sent anywhere.

## Things you should know

- **Clearing site data deletes your prompts.** Browser "clear cookies and site data" removes
  `localStorage`. Download a backup first (Settings → Backup & restore).
- **Private/incognito windows** do not keep data after the window closes. The app detects this and warns you.
- **Backups are not encrypted.** A backup file is plain JSON. Anyone who can open the file can read your
  prompts. Do not put passwords, API keys or other secrets in prompts. Optional encryption is on the
  [roadmap](ROADMAP.md) but is **not implemented**.
- **Another person using the same browser profile** can open the app and read your prompts. The app has no
  lock screen.

## Removing everything

Settings → Danger zone → *Reset the application* erases the library, version history, settings, safety
copy, set-aside data and old-format copies from this browser. You must type `DELETE` to confirm. It cannot
be undone, so download a backup first if you might want the data back.
