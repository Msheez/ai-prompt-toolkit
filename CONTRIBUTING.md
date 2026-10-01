# Contributing

Thanks for taking the time to look at the project. Issues, ideas and pull
requests are all welcome — including small ones like a typo fix.

## Getting set up

You need Node 18 or newer, and nothing else. There are no dependencies to
install.

```bash
git clone https://github.com/Msheez/ai-prompt-toolkit.git
cd ai-prompt-toolkit

npm start        # dev server on http://localhost:8000
npm test         # 58 unit tests
npm run check    # asset/icon/id checks, then the tests
```

Run `npm run check` before every push — CI runs exactly the same command.

## Where code goes

```text
assets/js/core/*   pure logic, no DOM, always unit tested
assets/js/app.js   DOM wiring only, no business rules
assets/css/*       tokens → base → components → layout (in that order)
tests/*.test.js    one file per core module
```

If you find yourself reaching for `document` inside `core/`, or writing an `if`
that decides *what the data means* inside `app.js`, the logic is in the wrong
file.

## Adding a feature — the loop

1. **Open an issue first** for anything bigger than a fix, so we agree on the shape.
2. **Write the logic in `core/`** as a pure function.
3. **Write the test** in `tests/<module>.test.js`. Node's built-in runner, no framework:

   ```js
   const test = require("node:test");
   const assert = require("node:assert/strict");
   const search = require("../assets/js/core/search.js");

   test("search matches tags", () => {
     const prompts = [{ title: "A", content: "", tags: ["seo"], category: "" }];
     assert.equal(search.queryPrompts(prompts, { query: "seo" }).length, 1);
   });
   ```

4. **Wire it into `app.js`** and give it a keyboard path if it is a common action.
5. **Run `npm run check`.**
6. **Update the docs**: `CHANGELOG.md` always, plus `README.md` / `docs/` if behaviour changed.

## Coding conventions

- Vanilla ES2020. No frameworks, no bundler, no runtime dependencies — that constraint is the project.
- Two-space indent, double quotes, semicolons, trailing commas in multi-line literals.
- Descriptive names over short ones (`filteredPrompts`, not `fp`).
- **Never build HTML from strings.** Use `document.createElement` + `textContent`. Any PR that introduces `innerHTML` with user data will be asked to change.
- Core modules keep the UMD wrapper so they run in the browser and in Node.
- Comments explain *why*, not *what*.
- CSS: use the tokens in `tokens.css` rather than hard-coded colours, so both themes keep working.

## Accessibility is not optional

New UI must be keyboard reachable, have a visible focus state, use real buttons
for actions, carry an `aria-label` when the label is only an icon, and keep
working with `prefers-reduced-motion`.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(search): rank title matches above body matches
fix(storage): survive a blocked localStorage in private mode
docs(readme): document the variable syntax
test(library): cover undo after delete
chore(ci): run on Node 22
```

## Pull requests

- One topic per pull request.
- Say what changed, why, and how you tested it (the template asks for this).
- Include a before/after screenshot for visual changes.
- Green CI is required; `npm run check` must pass on Node 18, 20 and 22.

## Reporting bugs

Use the [bug report template](https://github.com/Msheez/ai-prompt-toolkit/issues/new/choose)
and include your browser, what you expected, and what happened. If the library
itself is involved, a redacted JSON export helps enormously.

Security issues: please follow [SECURITY.md](SECURITY.md) instead of opening a
public issue.

## Code of conduct

Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md). Be
decent; assume good faith.
