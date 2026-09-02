---
name: roundup
description: "Live browser map of your herdr herd — every workspace, tab, and pane drawn as a flow graph with agent status (working, idle, blocked, done). Use when running inside herdr (HERDR_ENV=1) and Bobby asks to see the map, the roundup, where work is, who's blocked, or what's next in line."
---

# roundup — agent skill

before using this skill, check that `HERDR_ENV=1`. if it is not, say roundup needs herdr running and stop.

roundup draws your whole herd in the browser: workspaces on the left, tabs under them, and each tab's panes as a numbered flow — who is working, who is idle, who is blocked, who is done, and who is next in line.

the code lives at `/Users/tr3/Documents/repos/roundup` (GitHub: TR3-AI/roundup).

## start the map

```bash
node /Users/tr3/Documents/repos/roundup/bin/roundup.mjs
```

then open http://127.0.0.1:4777 — or tell Bobby it's live there.

it binds localhost only, polls `herdr` once a second, and pushes updates to the page live. it observes; it never sends input to any pane. clicking a tab in the sidebar focuses that tab in herdr — that is the only action it takes, and it is Bobby's own click.

to run it in a herdr pane instead of the foreground:

```bash
herdr pane split <your-pane-id> --direction down --no-focus
herdr pane run <new-pane-id> "node /Users/tr3/Documents/repos/roundup/bin/roundup.mjs"
```

`ROUNDUP_PORT` changes the port, `ROUNDUP_POLL_MS` the poll interval.

## what the map shows

- **sidebar** — every workspace, every tab, a status dot and pane count per tab. click a tab to inspect it (also focuses it in herdr).
- **flow** — the tab's panes left to right in creation order, numbered 1..n. that order is the pipeline: card 2 runs after card 1. a green pulsing card is working right now; yellow idle, red blocked, blue done, grey unknown. the outlined card is the focused pane.
- **chips** — per-tab status totals at the top.

## rules

- pane order within a tab is the pipeline order. v1 has no other source of "who is next" — do not invent one; if Bobby names a different order, that becomes a config, not a guess.
- statuses come straight from herdr's `agent_status`. never re-derive them from terminal text.
- the map is read-only except for tab focus on click. never send text or keys to panes from roundup.
