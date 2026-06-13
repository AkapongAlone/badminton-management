import Avatar from './Avatar'
import type { StatePlayer } from '../types'

// Persistent match-builder card. The organizer selects players from the player
// table (A / B buttons per row), reviews here, then clicks "เพิ่มลงคิว".
// "ขอ idea" calls the suggest endpoint and goes straight to the queue.
export default function MatchBuilderCard({
  players,
  teamA,
  teamB,
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
  onToggleA: (id: string) => void
  onToggleB: (id: string) => void
  onAddToQueue: () => void
  onSuggest: () => void
  onClear: () => void
  busy?: boolean
}) {
  const byId = new Map(players.map((p) => [p.id, p]))
  const canQueue = teamA.length === 2 && teamB.length === 2

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

      <p className="mt-2 text-center text-[11px] text-gray-400">
        กดปุ่ม A / B ในตารางผู้เล่นด้านล่างเพื่อเลือกลงทีม
      </p>
    </div>
  )
}
