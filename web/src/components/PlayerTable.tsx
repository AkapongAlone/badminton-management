import Avatar from './Avatar'
import SkillBadge from './SkillBadge'
import { fmtBaht, fmtElapsed } from '../hooks'
import type { StatePlayer } from '../types'

export default function PlayerTable({
  players,
  serverNow,
  sessionOpen,
  waitAlertMinutes,
  onTogglePaid,
  onCheckout,
  onEditShuttles,
}: {
  players: StatePlayer[]
  serverNow: () => number
  sessionOpen: boolean
  waitAlertMinutes: number
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
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const isOut = p.status === 'checked_out'
            const waitMs = now - p.waitingSince
            const overdue = p.status === 'waiting' && waitMs >= waitAlertMinutes * 60_000

            return (
              <tr
                key={p.id}
                className={`border-b border-gray-50 last:border-0 ${isOut ? 'opacity-40' : ''}`}
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
                  <SkillBadge skill={p.skill} size="xs" />
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
              <td colSpan={9} className="px-3 py-8 text-center text-gray-400">ยังไม่มีผู้เล่นเช็คอิน</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
