#!/usr/bin/env node
// herdrgraph — live visual map of herdr workspaces, tabs, panes, and agent status.
// One dependency-free Node file: polls the herdr CLI, serves one static page,
// pushes snapshots over SSE. Binds 127.0.0.1 only. Observes; never sends input.
import http from 'node:http'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.HERDRGRAPH_PORT || 4777)
const POLL_MS = Number(process.env.HERDRGRAPH_POLL_MS || 1000)

const herdr = (args) =>
  new Promise((resolve) => {
    execFile('herdr', args, { maxBuffer: 32 * 1024 * 1024, timeout: 8000 }, (err, stdout) => {
      if (err) return resolve(null)
      try { resolve(JSON.parse(stdout).result) } catch { resolve(null) }
    })
  })

// pane read prints text, not json
const herdrText = (args) =>
  new Promise((resolve) => {
    execFile('herdr', args, { maxBuffer: 32 * 1024 * 1024, timeout: 8000 }, (err, stdout) => {
      resolve(err ? null : stdout)
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
    const prev = prevPanes.get(p.pane_id)
    const status = p.agent_status || 'unknown'
    const pane = {
      id: p.pane_id, label: p.label || p.terminal_title_stripped || p.pane_id,
      agent: p.agent || null, status,
      cwd: p.foreground_cwd || p.cwd || '', focused: p.focused,
      // question flags survive across polls; the scanner below refreshes them
      question: prev?.question || null,
      // how long in this state — restarts reset the clock, nothing deeper
      statusSince: prev && prev.status === status ? prev.statusSince : Date.now(),
    }
    tabById.get(p.tab_id)?.panes.push(pane)
    if (prev && prev.status !== 'blocked' && status === 'blocked') {
      notify(`Blocked: ${pane.label}`, `${tabById.get(p.tab_id)?.label || ''} has a blocker`, '5', 'rotating_light')
    }
  }
  // panes arrive in creation order within each tab — that order IS the pipeline
  // flow. ponytail: v1 infers "next in line" from pane order; a config mapping
  // stage names to panes is the upgrade path if herdr ever exposes roles.
  snapshot = { ok: true, ts: Date.now(), workspaces: [...byWs.values()].sort((a, b) => a.number - b.number) }
  prevPanes = new Map()
  for (const w of snapshot.workspaces) for (const t of w.tabs) for (const p of t.panes) prevPanes.set(p.id, p)
  broadcast()
  maybeScanQuestions()
}

// herdr has no "waiting for an answer" status, so questions are sniffed from
// the pane's recent text. only INTERACTIVE MENUS count (option pickers you
// must answer or Escape out of) — bare "?" chat lines are noise, not questions.
// ponytail: heuristic, 10s cadence, idle panes only.
let prevPanes = new Map()
let lastQScan = 0
const Q_RE = /(?:do you want to proceed|esc to cancel|❯\s*\d+\.|\[y\/n\]|\(yes\/no\)|enter to select|↑↓.*navigate|allow once|allow always)/i

// push via ntfy — Bobby already runs it. one POST per transition, no deps.
const NTFY_TOPIC = process.env.NTFY_TOPIC || ''
const notifiedQ = new Set() // pane id + question text already pushed
function notify(title, body, priority, tags) {
  if (!NTFY_TOPIC) return
  fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: { Title: title, Priority: priority, Tags: tags },
    body,
  }).catch(() => { /* a missed buzz never breaks the board */ })
}

async function maybeScanQuestions() {
  if (Date.now() - lastQScan < 10000) return
  lastQScan = Date.now()
  const idle = []
  for (const w of snapshot.workspaces) for (const t of w.tabs) for (const p of t.panes) {
    if (p.status === 'idle') idle.push(p)
  }
  let changed = false
  for (const p of idle) {
    const text = await herdrText(['pane', 'read', p.id, '--source', 'recent-unwrapped', '--lines', '15'])
    const line = (text || '').split('\n').map((l) => l.trim()).filter(Boolean).reverse()
      .find((l) => Q_RE.test(l))
    const q = line ? line.slice(0, 140) : null
    if (q !== p.question) {
      p.question = q; changed = true
      const key = p.id + '|' + q
      if (q && !notifiedQ.has(key)) {
        notifiedQ.add(key)
        notify(`Question: ${p.label}`, q, '4', 'question')
      }
      if (!q) for (const k of notifiedQ) if (k.startsWith(p.id + '|')) notifiedQ.delete(k)
    }
  }
  if (changed) { lastSent = ''; broadcast() }
}

const clients = new Set()
let lastSent = ''
function broadcast() {
  const data = JSON.stringify(snapshot)
  if (data === lastSent) return
  lastSent = data
  for (const res of clients) res.write(`data: ${data}\n\n`)
}

// the UI is also hosted on GitHub Pages; the Pages copy talks to this daemon
// cross-origin, so allow exactly that origin (and local) — not the whole web.
const ALLOWED = /^https:\/\/tr3-ai\.github\.io$|^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/
const cors = (req, res) => {
  const origin = req.headers.origin || ''
  if (ALLOWED.test(origin)) res.setHeader('access-control-allow-origin', origin)
}

const server = http.createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
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
  if (url.pathname === '/api/pane') {
    const id = url.searchParams.get('id') || ''
    if (!/^[\w:.-]+$/.test(id)) { res.writeHead(400).end(); return }
    const text = await herdrText(['pane', 'read', id, '--source', 'recent-unwrapped', '--lines', '60'])
    if (text === null) { res.writeHead(502).end(); return }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(text)
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
    res.end(readFileSync(path.join(__dirname, '..', 'index.html')))
    return
  }
  res.writeHead(404).end()
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`herdrgraph watching the herd → http://127.0.0.1:${PORT}`)
})
setInterval(poll, POLL_MS)
poll()
