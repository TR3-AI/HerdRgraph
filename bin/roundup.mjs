#!/usr/bin/env node
// roundup — live visual map of herdr workspaces, tabs, panes, and agent status.
// One dependency-free Node file: polls the herdr CLI, serves one static page,
// pushes snapshots over SSE. Binds 127.0.0.1 only. Observes; never sends input.
import http from 'node:http'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.ROUNDUP_PORT || 4777)
const POLL_MS = Number(process.env.ROUNDUP_POLL_MS || 1000)

const herdr = (args) =>
  new Promise((resolve) => {
    execFile('herdr', args, { maxBuffer: 32 * 1024 * 1024, timeout: 8000 }, (err, stdout) => {
      if (err) return resolve(null)
      try { resolve(JSON.parse(stdout).result) } catch { resolve(null) }
    })
  })

let snapshot = { ok: false, ts: Date.now(), workspaces: [] }

async function poll() {
  const [ws, tabs, panes] = await Promise.all([
    herdr(['workspace', 'list']),
    herdr(['tab', 'list']),
    herdr(['pane', 'list']),
  ])
  if (!ws || !tabs || !panes) {
    snapshot = { ok: false, ts: Date.now(), error: 'herdr CLI unavailable — is herdr running?', workspaces: snapshot.workspaces }
    return
  }
  const byWs = new Map()
  for (const w of ws.workspaces) {
    byWs.set(w.workspace_id, {
      id: w.workspace_id, label: w.label, number: w.number,
      focused: w.focused, status: w.agent_status, tabs: [],
    })
  }
  const tabById = new Map()
  for (const t of tabs.tabs) {
    const tab = {
      id: t.tab_id, label: t.label, number: t.number,
      focused: t.focused, status: t.agent_status, panes: [],
    }
    tabById.set(t.tab_id, tab)
    byWs.get(t.workspace_id)?.tabs.push(tab)
  }
  for (const p of panes.panes) {
    tabById.get(p.tab_id)?.panes.push({
      id: p.pane_id, label: p.label || p.terminal_title_stripped || p.pane_id,
      agent: p.agent || null, status: p.agent_status || 'unknown',
      cwd: p.foreground_cwd || p.cwd || '', focused: p.focused,
    })
  }
  // panes arrive in creation order within each tab — that order IS the pipeline
  // flow. ponytail: v1 infers "next in line" from pane order; a config mapping
  // stage names to panes is the upgrade path if herdr ever exposes roles.
  snapshot = { ok: true, ts: Date.now(), workspaces: [...byWs.values()].sort((a, b) => a.number - b.number) }
  broadcast()
}

const clients = new Set()
let lastSent = ''
function broadcast() {
  const data = JSON.stringify(snapshot)
  if (data === lastSent) return
  lastSent = data
  for (const res of clients) res.write(`data: ${data}\n\n`)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(snapshot))
    return
  }
  if (url.pathname === '/api/focus' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      try {
        const { tab } = JSON.parse(body)
        if (typeof tab === 'string' && /^[\w:.-]+$/.test(tab)) await herdr(['tab', 'focus', tab])
      } catch { /* focus is best-effort */ }
      res.writeHead(204).end()
    })
    return
  }
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(readFileSync(path.join(__dirname, '..', 'public', 'index.html')))
    return
  }
  res.writeHead(404).end()
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`roundup watching the herd → http://127.0.0.1:${PORT}`)
})
setInterval(poll, POLL_MS)
poll()
