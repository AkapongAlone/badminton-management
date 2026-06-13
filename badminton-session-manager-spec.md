# Badminton Session Manager — Spec v1

A web app for Thai badminton group ("ก๊วน") organizers. One organizer manages a recurring group; players join daily sessions, get queued/matched onto courts, and pay based on the group's billing mode. Players view a read-only live board via QR code.

This spec is the result of a full design interview. All decisions below are final for v1 — do not re-open them. Anything marked **v2** is explicitly out of scope.

---

## 1. Scope & Non-Goals

**In scope (v1):**
- Single-group tool. One organizer creates one Group and runs one Session per day.
- Real deployment (Fly.io / Railway), publicly reachable so players can use mobile data.
- Queue visibility, wait-time alerts, match suggestions, billing calculation, daily profit summary.

**Out of scope (v1):**
- Multi-organizer platform / sign-up / auth system
- Session history list page (data is retained in DB, but no UI to browse old sessions)
- PromptPay QR payment
- Per-player price overrides / discounts (special deals are handled outside the system)
- Photo upload (avatars are generated)
- Singles / 3-player games (doubles only)
- Mid-game substitution modeling (handled via the "end game + start new game" workaround)

---

## 2. Tech Stack

- **Backend:** Go + Fiber
- **DB:** SQLite via `modernc.org/sqlite` (pure Go, no CGO)
- **Frontend:** React + Vite + Tailwind CSS
- **Packaging:** frontend build embedded into the Go binary with `go:embed` → single binary deploy
- **Realtime:** client polling every **5 seconds** against a single `GET /state` endpoint returning the full session state as one JSON object. No SSE/WebSocket. Wait-time clocks tick client-side between polls (server sends timestamps, client computes elapsed).

---

## 3. Identity & Access Model

No login, no user accounts.

- Creating a Group generates an **admin URL** containing a random token (e.g. `/g/{groupId}/admin?key={token}`). Whoever holds this URL is the organizer.
- The admin URL is stored in the organizer's browser `localStorage` so refresh/reopen keeps admin access. Provide a "Copy admin link" button; the UI should warn the organizer to save it somewhere safe (losing it = losing access; accepted risk, no recovery flow).
- Each daily Session has a **public board URL** (`/s/{sessionId}`). This URL is exposed **only** as a QR code pinned to the top-left of the admin dashboard. There is no other share UI, no "copy public link" button, and the admin URL must never appear in any shareable UI element.
- The public QR is per-session (new QR each day) so old links don't leak the new day's data.
- Public board must never expose: organizer costs, revenue, or profit. Per-player spending totals ARE visible on the public board (confirmed acceptable).

---

## 4. Data Model

```
Group
  id, name, adminToken
  defaultConfig: {
    billingMode: "buffet" | "per_shuttle",
    courtFee: int (THB, per player, flat),
    shuttlePrice: int (THB, per shuttle),   // per_shuttle mode only
    buffetPrice: int (THB),                  // buffet mode only
    courtCostTotal: int? (THB, optional),    // organizer's actual court rental cost
    shuttleCost: int? (THB, optional),       // organizer's cost per shuttle
    waitAlertMinutes: int (default 20)
  }

RosterPlayer            // persists across sessions ("ทะเบียนนักตี")
  id, groupId, name, skill: int (1–7), avatarSeed
  // skill scale maps to Thai casual ranks: มือหน้าบ้าน → N → NB → BG → B → C → C+up
  // skill is editable any time and accumulates accuracy over weeks

Session
  id, groupId, date, status: "open" | "closed"
  config (copied from Group.defaultConfig at creation, editable per day)
  courts: [{ id, label, status: "active" | "closed" }]   // can add/close mid-session

SessionPlayer           // per-day state, does NOT carry across days
  id, sessionId, rosterPlayerId
  status: "waiting" | "playing" | "checked_out"
  checkedInAt: timestamp
  waitingSince: timestamp        // see clock rules below
  gamesPlayed: int
  shuttlesUsed: int              // cumulative, manually correctable by organizer
  paid: bool

Game
  id, sessionId, courtId
  players: [4 × sessionPlayerId]  // always exactly 4, fixed for the game's lifetime
  teamA: [2 ids], teamB: [2 ids]
  startedAt, endedAt
  shuttlesUsed: int               // entered manually at game end; 0 is valid
```

Avatars: generated from name (DiceBear initials or similar). No image storage.

---

## 5. Billing Rules

Two modes, set in session config:

1. **Buffet (บุฟเฟ่):** every player pays `buffetPrice` flat. Shuttles still tracked per game for the organizer's cost/profit summary, but don't affect player charges.
2. **Per-shuttle (นับลูก):** player total = `courtFee + (shuttlePrice × shuttlesUsed)`.

Shuttle counting rules (per-shuttle mode):
- When a game ends, the organizer enters how many **new shuttles were opened during that game**. All 4 players in the game get `+N` each (full count, no splitting).
- Input defaults to **1** for fast confirmation, but **0 must be allowed** (game played entirely on a leftover shuttle from a previous game). Never auto-increment, never enforce a minimum — "new game opens a new shuttle" is group etiquette, not a system rule.
- Organizer can manually edit a player's cumulative `shuttlesUsed` (fix mistakes only — there is no price override of any kind).

Mid-game injury/substitution: not modeled. Organizer ends the current game (entering shuttles opened so far → charged to the original 4 including the injured player, which is fair) and starts a new game with the substitute (enter 0 if continuing the same shuttle). This yields correct billing with no substitution data model. `gamesPlayed` stats being off by one is accepted.

Checkout: sets status `checked_out`, shows the player's final total, removes them from queue/suggestions permanently, but the row stays in the table (dimmed, sorted to bottom) and their money stays in the summary.

Payment tracking: a paid/unpaid toggle per player, flipped manually by the organizer. Nothing more.

---

## 6. Queue, Clocks & Matching

**Player statuses:** only `waiting` and `playing` (plus terminal `checked_out`). No "resting" state — players who decline a game are simply skipped manually.

**Wait clock rules:**
- Starts at check-in.
- Stops when placed into a game (`playing`).
- On game end, player returns to `waiting` and the clock **resets to zero**.

**Wait alert (passive):** toast/badge on the admin dashboard when a player's wait time exceeds `waitAlertMinutes` (default 20, configurable). Wait time is the *only* alert trigger — games-played count is displayed in the table as context but never triggers alerts (a low game count may just mean the player arrived late).

**Match suggestion (on-demand only):** an "ขอ idea" button per free court. Algorithm:
1. Anchor = longest-waiting player.
2. Fill 3 more from players with skill closest to the anchor, weighted by wait time.
3. Split into teams so the two sides' skill sums are as close as possible.

The suggestion only **highlights** the 4 proposed players in the table and shows the proposed team split. There is **no "accept all" button** — the organizer always assigns players to the court manually, one by one, free to ignore the suggestion entirely. The system never auto-assigns anyone.

---

## 7. Screens (3 pages)

### 7.1 Setup / Group page (admin)
- First run: create Group (name + default config) → lands on admin with token in localStorage.
- Each play day: "เปิดก๊วนวันนี้" button → creates a Session inheriting default config, with a per-day config edit step (prices, billing mode, court count, alert threshold, optional costs).
- Roster management: add/edit roster players (name, skill). Adding a player to today's session searches the existing roster first (returning players join in one tap with name/avatar/skill prefilled) or creates a new roster entry.

### 7.2 Admin dashboard
- **QR code pinned top-left** (public board link) — the only way in for viewers.
- **Player table** columns: avatar+name, skill, status, wait time (live ticking), games played, shuttles used, current total (THB), paid toggle, actions (assign to court / checkout / edit shuttle count).
- **Courts panel:** each active court shows the current game (4 players, team split, elapsed time) with an "end game" action prompting for shuttles opened (default 1, allows 0). Free courts show "ขอ idea" + manual assign. Courts can be added or closed mid-session.
- **Wait alerts:** toast when someone crosses the threshold.
- **Close session button** → status `closed`: all clocks stop, no new games/shuttles/check-ins, but paid toggles remain usable (late bank transfers happen) and the public board stays viewable.
- **Summary panel (organizer-only):** total revenue (split court/shuttle), player count, total games, total shuttles used, unpaid list, and — if costs were entered — profit = revenue − (courtCostTotal + shuttleCost × total shuttles), with breakdown.

### 7.3 Public board (read-only, via QR)
- Polls `GET /state` every 5s.
- Shows: full queue with wait times, who's playing on which court and with whom, games played, shuttles used, and each player's current spending total.
- **Never shows:** organizer costs, revenue, profit, or any config cost fields.
- A player taps their own row to see a focused view of their status/queue position/total (no auth — same data as the board, just focused).

---

## 8. API Sketch

```
POST /api/groups                          create group → returns adminToken
POST /api/groups/{id}/sessions            open today's session (admin)
PATCH /api/sessions/{id}/config           edit per-day config (admin)
POST /api/sessions/{id}/close             close session (admin)

GET  /api/sessions/{id}/state             full state JSON (public — used by both board and admin UI;
                                          strips cost/revenue/profit fields unless admin token present)

POST /api/sessions/{id}/players           check in (from roster or new roster entry) (admin)
POST /api/players/{id}/checkout           (admin)
PATCH /api/players/{id}                   edit shuttlesUsed, paid toggle (admin)

POST /api/sessions/{id}/courts            add court (admin)
PATCH /api/courts/{id}                    close court (admin)

POST /api/courts/{id}/games               start game with 4 players + team split (admin)
POST /api/games/{id}/end                  end game, body: { shuttlesUsed } (admin)

GET  /api/sessions/{id}/suggest?courtId=  match suggestion (admin)

GET  /api/groups/{id}/roster              roster search/list (admin)
POST /api/groups/{id}/roster              add roster player (admin)
PATCH /api/roster/{id}                    edit name/skill (admin)
```

Admin endpoints authenticate via the token (query param or header). Public board only ever calls `GET state` without a token and must receive the sanitized payload.

---

## 9. Key Invariants (enforce in code)

1. A game always has exactly 4 distinct players, all `waiting` at assignment time.
2. `shuttlesUsed` on a game is ≥ 0; entering 0 is a normal, supported path.
3. Checked-out players never appear in suggestions or the assignable list, but always appear in the table and summary.
4. Public `state` payload is sanitized server-side (cost/revenue/profit stripped) — never rely on the frontend to hide it.
5. Closing a session freezes everything except the paid toggle and read access.
6. Prices come only from session config — there is no code path for per-player pricing.
