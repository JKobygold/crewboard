# Contributing to Crewboard

Thanks for helping. Bug fixes, tests and small focused improvements are all welcome.

## Getting started

1. Fork the repo and clone your fork.
2. `node server.js` and open http://localhost:3000. There is no build step: edit files in `public/` and reload.
3. Create a branch: `git checkout -b fix/short-description`.

## Before you open a pull request

Run the QA loop and make sure it passes:

```bash
npm i --no-save playwright@1.56.0 && npx playwright install chromium   # one time
npm test
```

The same checks run automatically on every pull request (GitHub Actions → **QA**). A PR can be merged when they pass.

### How the QA loop works

- **Static audit**: every `data-action` button in `public/app.js` has a handler.
- **Button crawl** (`qa/crawl.cjs`): opens 18 screens and clicks every control, plus every option in the menus they open,
  each time from a fresh copy of `seed.json`. It fails on crashes, console errors, controls that can't be clicked, and
  controls that change nothing.
- **Goal checks** (`qa/goals.cjs`): real workflows with explicit assertions, checked on screen *and* in the saved server data,
  plus server checks (password lock, health check).

**If you change behavior, add or update a goal** in `qa/goals.cjs` that proves it works. If you add a new screen,
add it to `STATES` in `qa/crawl.cjs`.

## Code style

- Plain JavaScript, no frameworks, no runtime dependencies. Please keep it that way; open an issue first if you think a dependency is needed.
- UI text: short, plain, active voice ("Hand off", "Marked done").
- Every color comes from a CSS variable in `styles.css`, defined for both dark and light themes.
- Escape anything user-typed with `esc()` before putting it into HTML.

## Reporting bugs

Open an issue with the steps to reproduce, what you expected, and what happened. A screenshot helps.
If the QA report (`qa/report.md`) shows a failure, paste the failing line.

## Pull request checklist

- [ ] `npm test` passes locally
- [ ] New or changed behavior has a goal in `qa/goals.cjs`
- [ ] Works in dark and light theme, and at phone width
- [ ] No real personal data added to `seed.json`
