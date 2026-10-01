<!--
Thanks for contributing! Keep each pull request to one topic.
See CONTRIBUTING.md for the workflow and conventions.
-->

## What does this change?

<!-- A sentence or two. Link the issue it closes: "Closes #12". -->

## Why?

<!-- The problem being solved, or the behaviour that was wrong. -->

## How was it tested?

<!-- Unit tests added? Which browsers did you click through? -->

- [ ] `npm run check` passes locally
- [ ] Added or updated unit tests for logic in `assets/js/core/`
- [ ] Clicked through the change in at least one browser

## Screenshots

<!-- Before / after for anything visual. Delete this section if not relevant. -->

## Checklist

- [ ] Logic lives in `assets/js/core/` (pure, no DOM); `app.js` only wires it up
- [ ] No new runtime dependencies and no build step
- [ ] No `innerHTML` with user-supplied data
- [ ] New UI is keyboard accessible and has a visible focus state
- [ ] Colours come from the tokens in `assets/css/tokens.css` (both themes still work)
- [ ] `CHANGELOG.md` updated
- [ ] Docs updated if behaviour changed
