# DESIGN.md — HerdRgraph

Visual world: **operations blueprint board** (pinned by Bobby: limen's hero board × agenttrail's live map).

## Scene
Bobby watches a wall of agents from his desk and checks in from his phone. A monitoring surface read at arm's length and at thumb's length — dark because the room is dark and the other screens are bright.

## Palette
- Ground: `#07090c` (near-black blueprint paper)
- Panel: `#0c0f14`, hairline: `#1a2029`
- Ink: `#d6dde8`; dim: `#6b7688`
- Accent (labels, section heads, the "now"): signal red `#f85149` (limen board red)
- Status (functional, never decorative):
  - working `#3fb950` (glow + radar rings + fast traveling dot)
  - idle `#d29922` (slow dim dot)
  - blocked `#f85149` (pulsing edge)
  - done `#58a6ff` (static hairline)
  - unknown `#6b7688`

## Type
All ui-monospace (SF Mono → JetBrains Mono → Menlo → Consolas). Legitimate: every label is data or measurement. Section heads uppercase, tracked +0.12em, red or dim.

## Topology
- Desktop: board panel left (workspaces → tabs), canvas right. Panes are nodes on a horizontal spine, cards hang under nodes, edges between consecutive nodes carry traveling dots (SMIL animateMotion, speed = status).
- Mobile (≤760px): board becomes a slide-in drawer (hamburger in header, scrim behind, Escape/backdrop closes). Spine rotates vertical, cards stack, dots travel downward.
- Status changes between polls flash the card edge — the board must feel alive without being touched.

## Rules
- Blueprint grid on the canvas only (it is the measuring tool), never on panels.
- One elevation system: 1px hairline + glow for live elements. No shadows-as-decoration.
- Status is always color AND text (badge) — never color alone.
- Motion is authored once: traveling dots + radar rings + change-flash. No scattered hover gimmicks; hover only brightens the edge a node owns.
