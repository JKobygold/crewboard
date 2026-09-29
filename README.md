# Crewboard

A lightweight, self-hosted project board for small teams: workspaces with boards and dashboards, groups of tasks,
subitems, owners, one-click hand-offs, and Main table / Cards / Kanban / Timeline views.
Everyone who opens the site works on the same boards; teammates' changes appear within a few seconds.

- **Zero dependencies at runtime.** `server.js` is plain Node (18+), and the app in `public/` is plain HTML, CSS and JavaScript with no build step.
- **Your data stays yours.** It is stored in one JSON file on your own server.
- **Tested.** An automated QA loop clicks every control and checks 53 real workflows on every pull request.

## Features

| Area | What you get |
|---|---|
| Boards | Groups (collapsible, colored), tasks, subitems with their own owner/status/date, inline rename, drag rows between groups, undo for deletes |
| Columns | Owner, Status, Priority, Due date, Timeline, Tags, Notes, Progress, Text, Numbers (with a sum footer), Checkbox, Link. Add, rename, resize, hide or remove them per board |
| Status labels | Rename and recolor the labels per board, or add your own from a 30-color palette ("Edit labels" in the status menu). Marking something Done plays a small celebration |
| Views | Main table, Cards, Kanban (drag between statuses, status battery), Timeline, Calendar |
| Working the board | Search, person and status/priority/tag filters, sort, group by status/person/priority, bulk actions incl. CSV export, keyboard shortcuts (Ctrl+G collapse groups, Cmd/Ctrl+. toggle the side panel) |
| People | Invite members, assign one or many, hand off a task with a note, updates thread with @mentions, likes and replies, activity log per task |
| Overview | My work (everything assigned to a person, by date), notifications, dashboard (status, owner, overdue, due-date charts) |
| Look | Dark and light themes, works on phones |

## Run it locally

```bash
git clone https://github.com/JKobygold/crewboard.git
cd crewboard
node server.js            # open http://localhost:3000
```

It starts with the example workspace in `seed.json`. To start with your own data instead, put it in
`seed.local.json` (same shape, ignored by git) or point `SEED_FILE` at a file.

## Deploy (Railway, or any Node host)

```bash
railway init && railway up && railway domain
railway volume add --mount-path /data                       # keep data between deploys
railway variables --set CREWBOARD_PASSWORD=choose-one       # lock it with a team password
```

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (set automatically by Railway) |
| `DATA_DIR` | Where `crewboard.json` is stored. Defaults to `/data` if it exists, else `./data` |
| `CREWBOARD_PASSWORD` | If set, the browser asks for it once (any username works). Strongly recommended for anything public |
| `SEED_FILE` | Starting data for a brand-new install |

## Tests

```bash
npm i --no-save playwright@1.56.0 && npx playwright install chromium   # one time
npm test              # full QA round: button crawl + goal checks (~6 min)
npm run test:goals    # goal checks only (~4 min)
```

Each round writes `qa/report.md` and appends to `qa/history.jsonl`. See [CONTRIBUTING.md](CONTRIBUTING.md) for how the loop works.

## Project layout

```
server.js        HTTP server: static files, JSON API, optional password, per-task merge of concurrent edits
public/          the app (index.html, styles.css, app.js)
seed.json        example workspace used for new installs and for the tests
qa/              QA loop: crawl.cjs (clicks everything), goals.cjs (workflow checks), run.cjs (report + history)
```

## License

[MIT](LICENSE)
