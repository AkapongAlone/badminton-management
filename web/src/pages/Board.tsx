import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { fmtBaht, fmtElapsed, useSessionState } from '../hooks'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import Logo from '../components/Logo'
import SkillBadge from '../components/SkillBadge'
import type { StatePlayer } from '../types'

// Public read-only board, reached via the QR on the admin dashboard.
// The server sends a sanitized payload here (no costs/revenue/profit).
export default function Board() {
  const { sessionId = '' } = useParams()
  const { state, error, serverNow } = useSessionState(sessionId)
  const [focus, setFocus] = useState<StatePlayer | null>(null)

  if (error && !state) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 p-4">ไม่พบก๊วนนี้ ({error})</div>
  }
  if (!state) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด…</div>
  }

  const open = state.session.status === 'open'
  const playersById = new Map(state.players.map((p) => [p.id, p]))
  const name = (id: string) => playersById.get(id)?.name ?? '?'

  const waiting = state.players
    .filter((p) => p.status === 'waiting')
    .sort((a, b) => a.waitingSince - b.waitingSince)
  const queuePos = (id: string) => waiting.findIndex((p) => p.id === id) + 1

  // Viewers only see who's still in play — waiting or on a court. People who've
  // checked out (gone home) are hidden from the public board.
  const order = { waiting: 0, playing: 1, checked_out: 2 }
  const sorted = [...state.players]
    .filter((p) => p.status === 'waiting' || p.status === 'playing')
    .sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
      if (a.status === 'waiting') return a.waitingSince - b.waitingSince
      return a.checkedInAt - b.checkedInAt
    })

  // keep the focused player's data fresh across polls
  const focused = focus ? playersById.get(focus.id) ?? null : null

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-10">
      <header className="px-4 py-4 text-center">
        <div className="mb-2 flex justify-center"><Logo size="md" light /></div>
        <h1 className="text-xl font-bold">{state.session.groupName}</h1>
        <p className="text-sm text-gray-400">
          {state.session.date} ·{' '}
          <span className={open ? 'text-emerald-400' : 'text-gray-500'}>{open ? 'กำลังเล่น' : 'จบแล้ว'}</span>
        </p>
      </header>

      <main className="mx-auto max-w-2xl px-3 space-y-5">
        {/* Courts */}
        <section className="grid gap-2 sm:grid-cols-2">
          {state.courts
            .filter((c) => c.status === 'active')
            .map((c) => (
              <div key={c.id} className="rounded-xl bg-gray-800 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{c.label}</span>
                  {c.game ? (
                    <span className="font-mono text-xs text-blue-300">{fmtElapsed(serverNow() - c.game.startedAt)}</span>
                  ) : (
                    <span className="text-xs text-gray-500">ว่าง</span>
                  )}
                </div>
                {c.game && (
                  <div className="mt-1.5 text-sm text-gray-200">
                    <div>{c.game.teamA.map(name).join(' + ')}</div>
                    <div className="text-center text-[10px] text-gray-500">vs</div>
                    <div>{c.game.teamB.map(name).join(' + ')}</div>
                  </div>
                )}
              </div>
            ))}
        </section>

        {/* Queue */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-400">คิวรอ ({waiting.length})</h2>
          <div className="space-y-1.5">
            {waiting.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setFocus(p)}
                className="flex w-full items-center gap-3 rounded-xl bg-gray-800 px-3 py-2.5 text-left hover:bg-gray-700"
              >
                <span className="w-6 text-center text-sm font-bold text-gray-500">{i + 1}</span>
                <Avatar name={p.name} seed={p.avatarSeed} size={8} />
                <span className="flex-1 font-medium">{p.name}</span>
                <span className="font-mono text-sm text-amber-300">{fmtElapsed(serverNow() - p.waitingSince)}</span>
              </button>
            ))}
            {waiting.length === 0 && <p className="py-3 text-center text-sm text-gray-600">ไม่มีใครรอ</p>}
          </div>
        </section>

        {/* All players */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-400">ผู้เล่น ({sorted.length}) — แตะชื่อตัวเองเพื่อดูยอด</h2>
          <div className="overflow-x-auto rounded-xl bg-gray-800">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
                  <th className="px-3 py-2">ชื่อ</th>
                  <th className="px-2 py-2">สถานะ</th>
                  <th className="px-2 py-2 text-center">เกม</th>
                  <th className="px-2 py-2 text-center">ลูก</th>
                  <th className="px-3 py-2 text-right">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setFocus(p)}
                    className={`cursor-pointer border-b border-gray-700/50 last:border-0 hover:bg-gray-700 ${
                      p.status === 'checked_out' ? 'opacity-40' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={p.name} seed={p.avatarSeed} size={7} />
                        <span>{p.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {p.status === 'waiting' && <span className="text-amber-300">รอ (คิว {queuePos(p.id)})</span>}
                      {p.status === 'playing' && <span className="text-blue-300">กำลังเล่น</span>}
                      {p.status === 'checked_out' && <span className="text-gray-500">กลับแล้ว</span>}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">{p.gamesPlayed}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{p.shuttlesUsed}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtBaht(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {focused && (
        <Modal title="ยอดของฉัน" onClose={() => setFocus(null)}>
          <div className="space-y-3 text-center text-gray-800">
            <div className="flex justify-center">
              <Avatar name={focused.name} seed={focused.avatarSeed} size={16} />
            </div>
            <div className="text-xl font-bold">{focused.name}</div>
            <div className="flex items-center justify-center gap-1.5 text-sm text-gray-500">มือ <SkillBadge skill={focused.skill} /></div>
            <div className="text-sm">
              {focused.status === 'waiting' && (
                <>
                  คิวที่ <b>{queuePos(focused.id)}</b> · รอมา{' '}
                  <b className="font-mono">{fmtElapsed(serverNow() - focused.waitingSince)}</b>
                </>
              )}
              {focused.status === 'playing' && <span className="text-blue-600 font-medium">กำลังเล่นอยู่ 🏸</span>}
              {focused.status === 'checked_out' && <span className="text-gray-500">เช็คเอาท์แล้ว</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-gray-100 p-3">
                <div className="text-2xl font-bold">{focused.gamesPlayed}</div>
                <div className="text-xs text-gray-500">เกม</div>
              </div>
              <div className="rounded-xl bg-gray-100 p-3">
                <div className="text-2xl font-bold">{focused.shuttlesUsed}</div>
                <div className="text-xs text-gray-500">ลูก</div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <div className="text-2xl font-bold text-emerald-700">{fmtBaht(focused.total)}</div>
                <div className="text-xs text-emerald-600">{focused.paid ? 'จ่ายแล้ว ✓' : 'ยอดปัจจุบัน'}</div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
