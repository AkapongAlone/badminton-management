import { fmtElapsed } from '../hooks'
import Avatar from './Avatar'
import { skillLabel } from '../types'
import type { StatePlayer } from '../types'

// Self-contained match builder for the queue tab: pick waiting players into team
// A / B from the picker below, then "เพิ่มลงคิว" to append to the queue (you can
// keep building more). "ขอ idea" asks the server to suggest a fresh foursome and
// drops it straight into the queue.
export default function MatchBuilderCard({
  players,
  teamA,
  teamB,
  serverNow,
  onToggleA,
  onToggleB,
  onAddToQueue,
  onSuggest,
  onClear,
  busy,
}: {
  players: StatePlayer[]
  teamA: string[]
  teamB: string[]
  serverNow: () => number
  onToggleA: (id: string) => void
  onToggleB: (id: string) => void
  onAddToQueue: () => void
  onSuggest: () => void
  onClear: () => void
  busy?: boolean
}) {
  const byId = new Map(players.map((p) => [p.id, p]))
  const canQueue = teamA.length === 2 && teamB.length === 2
  const aFull = teamA.length >= 2
  const bFull = teamB.length >= 2
  const now = serverNow()

  // Anyone still around can be queued — including players already queued or
  // currently on a court (planning ahead). A queued match just can't START until
  // its players are free; that's enforced when starting, not here. Checked-out
  // players have gone home, so they're excluded.
  const statusRank = { waiting: 0, playing: 1, checked_out: 2 }
  const selectable = players
    .filter((p) => p.status !== 'checked_out')
    .sort((a, b) => {
      if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status]
      if (a.status === 'waiting') return a.waitingSince - b.waitingSince
      return a.checkedInAt - b.checkedInAt
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
        <div className="flex gap-2">
          <button
            onClick={onSuggest}
            disabled={busy}
            className="rounded-lg border border-amber-400 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            💡 ขอ idea
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
        {selectable.length === 0 ? (
          <p className="py-2 text-center text-sm text-gray-400">ยังไม่มีผู้เล่น — เช็คอินก่อนในแท็บแดชบอร์ด</p>
        ) : (
          <div className="space-y-1">
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
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{skillLabel(p.skill)}</span>
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
