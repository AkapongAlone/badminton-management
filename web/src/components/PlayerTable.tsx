import Avatar from './Avatar'
import { fmtBaht, fmtElapsed } from '../hooks'
import { skillLabel } from '../types'
import type { StatePlayer } from '../types'

export default function PlayerTable({
  players,
  serverNow,
  sessionOpen,
  waitAlertMinutes,
  teamA,
  teamB,
  onToggleA,
  onToggleB,
  onTogglePaid,
  onCheckout,
  onEditShuttles,
}: {
  players: StatePlayer[]
  serverNow: () => number
  sessionOpen: boolean
  waitAlertMinutes: number
  teamA: string[]
  teamB: string[]
  onToggleA: (id: string) => void
  onToggleB: (id: string) => void
  onTogglePaid: (p: StatePlayer) => void
  onCheckout: (p: StatePlayer) => void
  onEditShuttles: (p: StatePlayer) => void
}) {
  const now = serverNow()
  const order = { waiting: 0, playing: 1, checked_out: 2 }
  const sorted = [...players].sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    if (a.status === 'waiting') return a.waitingSince - b.waitingSince
    return a.checkedInAt - b.checkedInAt
  })

  const inA = (id: string) => teamA.includes(id)
  const inB = (id: string) => teamB.includes(id)

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="px-3 py-2.5">ผู้เล่น</th>
            <th className="px-2 py-2.5">มือ</th>
            <th className="px-2 py-2.5">สถานะ</th>
            <th className="px-2 py-2.5">เวลารอ</th>
            <th className="px-2 py-2.5 text-center">เกม</th>
            <th className="px-2 py-2.5 text-center">ลูก</th>
            <th className="px-2 py-2.5 text-right">ยอด</th>
            <th className="px-2 py-2.5 text-center">จ่าย</th>
            <th className="px-3 py-2.5 text-center">ทีม</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const isOut = p.status === 'checked_out'
            const waitMs = now - p.waitingSince
            const overdue = p.status === 'waiting' && waitMs >= waitAlertMinutes * 60_000
            const selectedA = inA(p.id)
            const selectedB = inB(p.id)
            const aFull = teamA.length >= 2
            const bFull = teamB.length >= 2

            return (
              <tr
                key={p.id}
                className={`border-b border-gray-50 last:border-0 ${isOut ? 'opacity-40' : ''} ${
                  selectedA ? 'bg-emerald-50' : selectedB ? 'bg-sky-50' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={p.name} seed={p.avatarSeed} size={8} />
                    <div>
                      <div className="font-medium leading-tight">{p.name}</div>
                      {p.note && <div className="text-[11px] text-gray-400 leading-tight">{p.note}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{skillLabel(p.skill)}</span>
                </td>
                <td className="px-2 py-2">
                  {p.status === 'waiting' && <span className="text-emerald-700 text-xs font-medium">รอ</span>}
                  {p.status === 'playing' && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">กำลังเล่น</span>
                  )}
                  {isOut && <span className="text-xs text-gray-500">กลับแล้ว</span>}
                </td>
                <td className={`px-2 py-2 tabular-nums ${overdue ? 'font-bold text-red-600' : 'text-gray-600'}`}>
                  {p.status === 'waiting' ? <>{fmtElapsed(waitMs)}{overdue && ' ⚠️'}</> : '–'}
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{p.gamesPlayed}</td>
                <td className="px-2 py-2 text-center tabular-nums">{p.shuttlesUsed}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmtBaht(p.total)}</td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => onTogglePaid(p)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${p.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}
                  >
                    {p.paid ? '✓ แล้ว' : 'ยังไม่จ่าย'}
                  </button>
                </td>
                {/* Team A/B toggle — only for waiting players in open session */}
                <td className="px-3 py-2 text-center">
                  {sessionOpen && p.status === 'waiting' && !isOut && (
                    <div className="flex justify-center gap-1">
                      <button
                        onClick={() => onToggleA(p.id)}
                        disabled={!selectedA && aFull}
                        className={`w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                          selectedA
                            ? 'bg-emerald-600 text-white'
                            : 'border border-emerald-400 text-emerald-600 hover:bg-emerald-50 disabled:opacity-25 disabled:cursor-not-allowed'
                        }`}
                      >
                        A
                      </button>
                      <button
                        onClick={() => onToggleB(p.id)}
                        disabled={!selectedB && bFull}
                        className={`w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                          selectedB
                            ? 'bg-sky-600 text-white'
                            : 'border border-sky-400 text-sky-600 hover:bg-sky-50 disabled:opacity-25 disabled:cursor-not-allowed'
                        }`}
                      >
                        B
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {!isOut && sessionOpen && (
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => onEditShuttles(p)}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        แก้ลูก
                      </button>
                      {p.status === 'waiting' && (
                        <button
                          onClick={() => onCheckout(p)}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          เช็คเอาท์
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-8 text-center text-gray-400">ยังไม่มีผู้เล่นเช็คอิน</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
