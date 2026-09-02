---
name: herdrgraph
description: "Live browser map of your herdr herd — every workspace, tab, and pane drawn as a flow graph with agent status (working, idle, blocked, done). Use when running inside herdr (HERDR_ENV=1) and Bobby asks to see the map, the graph, where work is, who's blocked, or what's next in line."
---

# herdrgraph — agent skill

before using this skill, check that `HERDR_ENV=1`. if it is not, say herdrgraph needs herdr running and stop.

HerdRgraph draws your whole herd in the browser: workspaces on the left, tabs under them, and each tab's panes as a numbered flow — who is working, who is idle, who is blocked, who is done, and who is next in line.

the code lives at `/Users/tr3/Documents/repos/herdrgraph` (GitHub: TR3-AI/HerdRgraph).

## start the map

```bash
node /Users/tr3/Documents/repos/herdrgraph/bin/herdrgraph.mjs
```

then open http://127.0.0.1:4777 — or tell Bobby it's live there.

the map is also on GitHub Pages: https://tr3-ai.github.io/HerdRgraph/ — that's the phone bookmark. the Pages copy reads `config.json` in the repo root for the live tunnel URL (`{"api":"https://…trycloudflare.com"}`) and pulls data from the Mac daemon over that tunnel. if the tunnel restarts with a new URL, update `config.json`, commit, push — Pages redeploys in about a minute. when the daemon is down, the page says so instead of failing silently.

it binds localhost only, polls `herdr` once a second, and pushes updates to the page live. it observes; it never sends input to any pane. clicking a tab in the sidebar focuses that tab in herdr — that is the only action it takes, and it is Bobby's own click.

to run it in a herdr pane instead of the foreground:

```bash
herdr pane split <your-pane-id> --direction down --no-focus
herdr pane run <new-pane-id> "node /Users/tr3/Documents/repos/herdrgraph/bin/herdrgraph.mjs"
```

`HERDRGRAPH_PORT` changes the port, `HERDRGRAPH_POLL_MS` the poll interval.

## what the map shows

- **sidebar** — every workspace, every tab, a status dot and pane count per tab. click a tab to inspect it (also focuses it in herdr).
- **flow** — the tab's panes left to right in creation order, numbered 1..n. that order is the pipeline: card 2 runs after card 1. a green pulsing card is working right now; yellow idle, red blocked, blue done, grey unknown. the outlined card is the focused pane.
- **chips** — per-tab status totals at the top.

## rules

- pane order within a tab is the pipeline order. v1 has no other source of "who is next" — do not invent one; if Bobby names a different order, that becomes a config, not a guess.
- statuses come straight from herdr's `agent_status`. never re-derive them from terminal text.
- the map is read-only except for tab focus on click. never send text or keys to panes from herdrgraph.
- the urgent strip pins 1·Blockers (real `blocked` status) then 2·Questions. questions are a text heuristic (idle panes scanned every 10s for prompt patterns) — the matched line is shown as evidence; expect some false positives and never present a flagged pane as certainly waiting.
