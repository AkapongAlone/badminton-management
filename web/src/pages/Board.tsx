import { useParams, Link } from 'react-router-dom'
import { fmtElapsed, useSessionState } from '../hooks'
import Logo from '../components/Logo'

// Public viewer — reached via QR code scan. Read-only, no billing info.
// Shows: currently playing courts, upcoming match queue, history.
// Tap "สมาชิก" to see today's players and their skill levels.
export default function Board() {
  const { sessionId = '' } = useParams()
  const { state, error, serverNow } = useSessionState(sessionId)

  if (error && !state) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 p-4">ไม่พบก๊วนนี้ ({error})</div>
  }
  if (!state) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด…</div>
  }

  const open = state.session.status === 'open'
  const playersById = new Map(state.players.map((p) => [p.id, p]))
  const name = (id: string) => playersById.get(id)?.name ?? '?'
  const now = serverNow()

  const activeCourts = state.courts.filter((c) => c.status === 'active' && c.game)

  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-10">
      <header className="px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Logo size="sm" light />
              <h1 className="text-lg font-bold">{state.session.groupName}</h1>
            </div>
            <p className="text-xs text-gray-500">
              {state.session.date} ·{' '}
              <span className={open ? 'text-emerald-400' : 'text-gray-500'}>
                {open ? 'กำลังเล่น' : 'จบแล้ว'}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to={`/s/${sessionId}/members`}
              className="shrink-0 rounded-xl border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:border-gray-400 hover:text-white"
            >
              👥 สมาชิก
            </Link>
            <Link
              to={`/g/${state.session.groupId}/stats`}
              className="shrink-0 rounded-xl border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:border-gray-400 hover:text-white"
            >
              📊 สถิติ
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-3 space-y-4">
        {/* Currently playing */}
        <section className="rounded-2xl bg-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">
            กำลังเล่น{' '}
            <span className="font-normal text-gray-600">({activeCourts.length})</span>
          </h2>
          {activeCourts.length === 0 ? (
            <p className="py-3 text-center text-sm text-gray-600">ยังไม่มีเกมที่กำลังเล่น</p>
          ) : (
            <div className="space-y-3">
              {activeCourts.map((c) => (
                <div key={c.id} className="rounded-xl bg-gray-700/60 p-3">
                  <div className="flex items-center justify-between text-xs text-blue-300 mb-2">
                    <span className="font-semibold">{c.label}</span>
                    <span className="font-mono tabular-nums">{fmtElapsed(now - c.game!.startedAt)}</span>
                  </div>
                  <div className="text-sm space-y-0.5">
                    <div>
                      <span className="text-emerald-400 font-medium">A:</span>{' '}
                      {c.game!.teamA.map(name).join(' + ')}
                    </div>
                    <div className="text-[11px] text-center text-gray-600">vs</div>
                    <div>
                      <span className="text-sky-400 font-medium">B:</span>{' '}
                      {c.game!.teamB.map(name).join(' + ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming match queue */}
        <section className="rounded-2xl bg-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-400">คิวถัดไป</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                state.matchQueue.length > 0
                  ? 'bg-emerald-900/60 text-emerald-400'
                  : 'bg-gray-700 text-gray-500'
              }`}
            >
              {state.matchQueue.length} เกม
            </span>
          </div>
          {state.matchQueue.length === 0 ? (
            <p className="py-3 text-center text-sm text-gray-600">ยังไม่มีคิว</p>
          ) : (
            <div className="space-y-2">
              {state.matchQueue.map((mq, i) => (
                <div key={mq.id} className="rounded-xl bg-gray-700/40 px-3 py-2.5 text-sm">
                  <span className="text-gray-500 text-xs mr-2">#{i + 1}</span>
                  <span className="text-emerald-400 font-medium">A:</span>{' '}
                  {mq.teamA.map(name).join(' + ')}
                  <span className="mx-2 text-gray-600">vs</span>
                  <span className="text-sky-400 font-medium">B:</span>{' '}
                  {mq.teamB.map(name).join(' + ')}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* History */}
        {state.history.length > 0 && (
          <section className="rounded-2xl bg-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">
              เล่นจบแล้ว{' '}
              <span className="font-normal text-gray-600">({state.history.length})</span>
            </h2>
            <div className="divide-y divide-gray-700/40 max-h-72 overflow-y-auto">
              {state.history.map((g) => {
                const resultLabel = g.result === 'A' ? 'A ชนะ' : g.result === 'B' ? 'B ชนะ' : g.result === 'draw' ? 'เสมอ' : null
                const resultCls = g.result === 'A' ? 'bg-emerald-900/60 text-emerald-400' : g.result === 'B' ? 'bg-sky-900/60 text-sky-400' : 'bg-gray-700 text-gray-400'
                return (
                  <div key={g.id} className="flex items-center gap-2 py-2 text-sm">
                    <div className="flex-1 min-w-0 text-gray-300">
                      {g.teamA.map(name).join(' + ')}
                      <span className="mx-1.5 text-gray-600">vs</span>
                      {g.teamB.map(name).join(' + ')}
                    </div>
                    {resultLabel && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${resultCls}`}>
                        {resultLabel}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] font-mono text-gray-500">
                      {clock(g.endedAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
