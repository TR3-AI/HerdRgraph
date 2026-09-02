# 🤠 roundup

**See the whole herd at a glance.**

roundup is a live browser map of [herdr](https://herdr.dev) — every workspace, tab, and pane drawn as a flow graph with real agent status: who's **working**, **idle**, **blocked**, **done**, and who's next in line.

```bash
node bin/roundup.mjs
# open http://127.0.0.1:4777
```

One dependency-free Node file. One static page. No database, no build, no account, no telemetry. It binds `127.0.0.1` only, polls the `herdr` CLI once a second, and pushes snapshots to the page over SSE. It observes — it never sends input to a pane (clicking a tab focuses it in herdr; that's all).

## What you see

- **Sidebar** — workspaces and tabs with status dots and pane counts. Click a tab to inspect it.
- **Flow** — the tab's panes left to right in creation order, numbered 1..n. That order *is* the pipeline: card 2 picks up after card 1.
- **Status** — green pulsing = working, yellow = idle, red = blocked, blue = done, grey = unknown, straight from herdr's `agent_status`.
- **Chips** — per-tab status totals.

## Configuration

| Env | Default | What |
|---|---|---|
| `ROUNDUP_PORT` | `4777` | HTTP port |
| `ROUNDUP_POLL_MS` | `1000` | herdr poll interval |

Inspired by [agenttrail](https://github.com/sodiumsun/agenttrail)'s architecture (one daemon, one page, localhost-only) — built fresh for herdr's data.

## License

MIT
