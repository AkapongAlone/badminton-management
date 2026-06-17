import { useState } from 'react'
import { fmtElapsed } from '../hooks'
import Avatar from './Avatar'
import SkillBadge from './SkillBadge'
import type { StatePlayer, MatchQueueItem } from '../types'

type SortKey = 'default' | 'name' | 'skill' | 'wait' | 'games'
type SortDir = 'asc' | 'desc'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default', label: 'เริ่มต้น' },
  { key: 'name', label: 'ชื่อ' },
  { key: 'skill', label: 'skill' },
  { key: 'wait', label: 'เวลารอ' },
  { key: 'games', label: 'เกม' },
]
// First time you pick a column it sorts in the direction that's usually most
// useful (strongest / longest-waiting / fewest games first); clicking again flips it.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  default: 'asc',
  name: 'asc',
  skill: 'desc',
  wait: 'desc',
  games: 'asc',
}

// Self-contained match builder for the queue tab: pick waiting players into team
// A / B from the picker below, then "เพิ่มลงคิว" to append to the queue (you can
// keep building more). "ขอ idea" asks the server to suggest a fresh foursome and
// drops it straight into the queue.
export default function MatchBuilderCard({
  players,
  queue,
  teamA,
  teamB,
  serverNow,
  onToggleA,
  onToggleB,
  onAddToQueue,
  onSuggest,
  onAiSuggest,
  onClear,
  busy,
}: {
  players: StatePlayer[]
  queue: MatchQueueItem[]
  teamA: string[]
  teamB: string[]
  serverNow: () => number
  onToggleA: (id: string) => void
  onToggleB: (id: string) => void
  onAddToQueue: () => void
  onSuggest: () => void
  onAiSuggest: () => void
  onClear: () => void
  busy?: boolean
}) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  // Same column → flip direction; new column → start at its sensible default.
  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(DEFAULT_DIR[key])
    }
  }
  const byId = new Map(players.map((p) => [p.id, p]))
  // How many queued (not-yet-started) matches each player is already booked into,
  // so the picker can show a "(+n)" hint next to their played-games count.
  const queuedCount = new Map<string, number>()
  for (const m of queue) {
    for (const id of [...m.teamA, ...m.teamB]) {
      queuedCount.set(id, (queuedCount.get(id) ?? 0) + 1)
    }
  }
  const canQueue = teamA.length === 2 && teamB.length === 2
  const aFull = teamA.length >= 2
  const bFull = teamB.length >= 2
  const now = serverNow()

  // Anyone still around can be queued — including players already queued or
  // currently on a court (planning ahead). A queued match just can't START until
  // its players are free; that's enforced when starting, not here. Checked-out
  // players have gone home, so they're excluded.
  const statusRank = { waiting: 0, playing: 1, checked_out: 2 }
  const term = query.trim().toLowerCase()
  const selectable = players
    .filter((p) => p.status !== 'checked_out' && (!term || p.name.toLowerCase().includes(term)))
    .sort((a, b) => {
      if (sortKey === 'default') {
        if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status]
        if (a.status === 'waiting') return a.waitingSince - b.waitingSince
        return a.checkedInAt - b.checkedInAt
      }
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'th') // ascending = ก → ฮ
          break
        case 'skill':
          cmp = a.skill - b.skill // ascending = อ่อน → เก่ง
          break
        case 'wait':
          cmp = b.waitingSince - a.waitingSince // ascending = รอน้อย → รอนาน
          break
        case 'games':
          cmp = a.gamesPlayed - b.gamesPlayed // ascending = เกมน้อย → เกมเยอะ
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  const Slot = ({ id, team, onRemove }: { id: string; team: 'A' | 'B'; onRemove: () => void }) => {
    const p = byId.get(id)
    if (!p) return null
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-1 py-0.5 text-xs font-medium ${team === 'A' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
        <Avatar name={p.name} seed={p.avatarSeed} size={5} />
        {p.name}
        <button onClick={onRemove} className="opacity-60 hover:opacity-100 leading-none">✕</button>
      </span>
    )
  }

  const EmptySlot = ({ team }: { team: 'A' | 'B' }) => (
    <span className={`inline-flex items-center rounded-full border border-dashed px-3 py-0.5 text-xs ${team === 'A' ? 'border-emerald-300 text-emerald-400' : 'border-sky-300 text-sky-400'}`}>
      ว่าง
    </span>
  )

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-700">จัดคู่</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onSuggest}
            disabled={busy}
            className="rounded-lg border border-amber-400 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            💡 ขอ idea
          </button>
          <button
            onClick={onAiSuggest}
            disabled={busy}
            className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            🤖 ขอไอเดียจาก AI
          </button>
          {(teamA.length > 0 || teamB.length > 0) && (
            <button
              onClick={onClear}
              className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
            >
              ล้าง
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start text-sm">
        {/* Team A */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-emerald-700 mb-1">ทีม A</div>
          {teamA.map((id) => <Slot key={id} id={id} team="A" onRemove={() => onToggleA(id)} />)}
          {Array.from({ length: 2 - teamA.length }).map((_, i) => <EmptySlot key={i} team="A" />)}
        </div>

        <div className="text-gray-300 text-xs text-center pt-5">vs</div>

        {/* Team B */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-sky-700 mb-1">ทีม B</div>
          {teamB.map((id) => <Slot key={id} id={id} team="B" onRemove={() => onToggleB(id)} />)}
          {Array.from({ length: 2 - teamB.length }).map((_, i) => <EmptySlot key={i} team="B" />)}
        </div>
      </div>

      <button
        disabled={!canQueue || busy}
        onClick={onAddToQueue}
        className="mt-3 w-full rounded-lg bg-gray-800 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-30"
      >
        {canQueue ? 'เพิ่มลงคิวเกม →' : `เลือกผู้เล่นให้ครบ 4 คน (${teamA.length + teamB.length}/4)`}
      </button>

      {/* Player picker — pick anyone still around (you can plan ahead) */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          เลือกผู้เล่น ({selectable.length})
        </div>

        {/* filter + sort — kept in its own tinted panel so the controls read as a
            distinct toolbar instead of blending into the player rows below */}
        <div className="mb-3 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5" data-testid="player-picker-controls">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ…"
              data-testid="player-search-input"
              className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">เรียงตาม</span>
            {SORT_OPTIONS.map((o) => {
              const active = sortKey === o.key
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => handleSort(o.key)}
                  data-testid={`sort-${o.key}`}
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
                    active ? 'bg-gray-800 text-white' : 'border border-gray-300 bg-white text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {o.label}
                  {active && o.key !== 'default' && (
                    <span className="ml-0.5" data-testid={`sort-dir-${o.key}`}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {selectable.length === 0 ? (
          <p className="py-2 text-center text-sm text-gray-400">
            {term ? 'ไม่พบผู้เล่นตามที่ค้นหา' : 'ยังไม่มีผู้เล่น — เช็คอินก่อนในแท็บแดชบอร์ด'}
          </p>
        ) : (
          <div className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
            {selectable.map((p) => {
              const selA = teamA.includes(p.id)
              const selB = teamB.includes(p.id)
              const playing = p.status === 'playing'
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${selA ? 'bg-emerald-50' : selB ? 'bg-sky-50' : 'hover:bg-gray-50'}`}
                >
                  <Avatar name={p.name} seed={p.avatarSeed} size={7} />
                  <span className="flex-1 min-w-0 truncate text-sm font-medium">{p.name}</span>
                  <span className="hidden sm:flex items-center justify-end gap-0.5 tabular-nums text-[10px] text-gray-400 w-14">
                    {p.gamesPlayed} เกม
                    {(queuedCount.get(p.id) ?? 0) > 0 && (
                      <span className="font-semibold text-emerald-600" title="อยู่ในคิวแล้ว" data-testid="queued-count">
                        +{queuedCount.get(p.id)}
                      </span>
                    )}
                  </span>
                  <SkillBadge skill={p.skill} size="xs" />
                  {playing ? (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">กำลังเล่น</span>
                  ) : (
                    <span className="hidden sm:inline tabular-nums text-[11px] text-gray-400 font-mono w-10 text-right">{fmtElapsed(now - p.waitingSince)}</span>
                  )}
                  <button
                    onClick={() => onToggleA(p.id)}
                    disabled={!selA && aFull}
                    className={`w-7 h-7 rounded-full text-xs font-bold transition-colors ${selA ? 'bg-emerald-600 text-white' : 'border border-emerald-400 text-emerald-600 hover:bg-emerald-50 disabled:opacity-25 disabled:cursor-not-allowed'}`}
                  >
                    A
                  </button>
                  <button
                    onClick={() => onToggleB(p.id)}
                    disabled={!selB && bFull}
                    className={`w-7 h-7 rounded-full text-xs font-bold transition-colors ${selB ? 'bg-sky-600 text-white' : 'border border-sky-400 text-sky-600 hover:bg-sky-50 disabled:opacity-25 disabled:cursor-not-allowed'}`}
                  >
                    B
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
