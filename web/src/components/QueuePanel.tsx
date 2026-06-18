import { fmtElapsed } from '../hooks'
import type { HistoryGame, MatchQueueItem, StateCourt, StatePlayer } from '../types'

// The queue tab's single source of truth for matches: what's playing on each
// court, what's queued up (with per-court start buttons), and what's finished.
// There is no separate courts grid — courts surface only as "currently playing"
// rows and as the start targets on queued matches.
export default function QueuePanel({
  courts,
  queue,
  history,
  playersById,
  sessionOpen,
  serverNow,
  onStart,
  onCancel,
  onEndGame,
  onEditResult,
  onCloseCourt,
  onAddCourt,
}: {
  courts: StateCourt[]
  queue: MatchQueueItem[]
  history: HistoryGame[]
  playersById: Map<string, StatePlayer>
  sessionOpen: boolean
  serverNow: () => number
  onStart: (mqId: string, courtId: string) => void
  onCancel: (mqId: string) => void
  onEndGame: (gameId: string, teamA: string[], teamB: string[]) => void
  onEditResult?: (gameId: string, current: 'A' | 'B' | 'draw' | null) => void
  onCloseCourt: (courtId: string) => void
  onAddCourt: () => void
}) {
  const name = (id: string) => playersById.get(id)?.name ?? '?'
  const activeCourts = courts.filter((c) => c.status === 'active')
  const playing = activeCourts.filter((c) => c.game)
  const freeCourts = activeCourts.filter((c) => !c.game)
  const now = serverNow()

  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-4">
      {/* Currently playing */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">
            กำลังเล่น <span className="text-gray-400 font-normal">({playing.length})</span>
          </h2>
          {sessionOpen && (
            <button
              onClick={onAddCourt}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              + เพิ่มสนาม
            </button>
          )}
        </div>

        {playing.length === 0 ? (
          <p className="py-3 text-center text-sm text-gray-400">ยังไม่มีเกมที่กำลังเล่น</p>
        ) : (
          <div className="space-y-2">
            {playing.map((c) => (
              <div key={c.id} className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                <div className="flex items-center justify-between text-xs text-blue-600 mb-1.5">
                  <span className="font-semibold">{c.label}</span>
                  <span className="font-mono tabular-nums">{fmtElapsed(now - c.game!.startedAt)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-emerald-700 font-medium">A:</span> {c.game!.teamA.map(name).join(' + ')}
                  <span className="mx-2 text-gray-300">vs</span>
                  <span className="text-sky-700 font-medium">B:</span> {c.game!.teamB.map(name).join(' + ')}
                </div>
                {sessionOpen && (
                  <button
                    onClick={() => onEndGame(c.game!.id, c.game!.teamA, c.game!.teamB)}
                    className="mt-2 w-full rounded-lg bg-blue-600 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    จบเกม
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {sessionOpen && freeCourts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-gray-400">สนามว่าง:</span>
            {freeCourts.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                {c.label}
                <button
                  onClick={() => onCloseCourt(c.id)}
                  className="text-gray-300 hover:text-red-500"
                  title="ปิดสนามนี้"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Queued matches */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">คิวรอ</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${queue.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
            {queue.length} เกม
          </span>
        </div>

        {queue.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            ยังไม่มีเกมในคิว — ใช้ "💡 ขอ idea" หรือเลือกผู้เล่นเองในช่อง "จัดคู่" ด้านบน
          </p>
        ) : (
          <div className="space-y-3">
            {queue.map((mq, i) => {
              const playersReady = [...mq.teamA, ...mq.teamB].every(
                (id) => playersById.get(id)?.status === 'waiting',
              )
              return (
                <div
                  key={mq.id}
                  className={`rounded-xl border p-3 ${playersReady ? 'border-gray-200' : 'border-amber-200 bg-amber-50/50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm">
                      <span className="text-gray-400 text-xs mr-1.5">#{i + 1}</span>
                      <span className="font-medium text-emerald-700">A:</span>{' '}
                      {mq.teamA.map(name).join(' + ')}
                      <span className="mx-2 text-gray-300">vs</span>
                      <span className="font-medium text-sky-700">B:</span>{' '}
                      {mq.teamB.map(name).join(' + ')}
                    </div>
                    {sessionOpen && (
                      <button
                        onClick={() => onCancel(mq.id)}
                        className="shrink-0 text-xs text-gray-300 hover:text-red-500"
                      >
                        ยกเลิก
                      </button>
                    )}
                  </div>

                  {!playersReady && (
                    <p className="mt-1 text-[11px] text-amber-600">⚠️ ผู้เล่นบางคนยังไม่อยู่ในสถานะรอ</p>
                  )}

                  {sessionOpen && freeCourts.length > 0 && playersReady && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {freeCourts.map((ct) => (
                        <button
                          key={ct.id}
                          onClick={() => onStart(mq.id, ct.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          ▶ เริ่มที่ {ct.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {sessionOpen && freeCourts.length === 0 && playersReady && (
                    <p className="mt-1.5 text-[11px] text-gray-400">ไม่มีคอร์ทว่าง — รอจบเกมที่กำลังเล่นอยู่</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Finished games */}
      {history.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-3">
            เล่นจบแล้ว <span className="text-gray-400 font-normal">({history.length})</span>
          </h2>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
            {history.map((g) => {
              const resultLabel =
                g.result === 'A' ? 'A ชนะ' : g.result === 'B' ? 'B ชนะ' : g.result === 'draw' ? 'เสมอ' : null
              const resultCls =
                g.result === 'A' ? 'bg-emerald-100 text-emerald-700' :
                g.result === 'B' ? 'bg-sky-100 text-sky-700' :
                g.result === 'draw' ? 'bg-gray-100 text-gray-500' : ''
              return (
                <div key={g.id} className="flex items-center gap-2 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-700">{g.teamA.map(name).join(' + ')}</span>
                    <span className="mx-1.5 text-gray-300">vs</span>
                    <span className="text-gray-700">{g.teamB.map(name).join(' + ')}</span>
                  </div>
                  {resultLabel ? (
                    <button
                      onClick={() => onEditResult?.(g.id, g.result ?? null)}
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${resultCls} ${onEditResult ? 'hover:opacity-70' : 'cursor-default'}`}
                    >
                      {resultLabel}
                    </button>
                  ) : onEditResult ? (
                    <button
                      onClick={() => onEditResult(g.id, null)}
                      className="shrink-0 text-[11px] text-gray-300 hover:text-gray-500"
                    >
                      บันทึกผล
                    </button>
                  ) : null}
                  <span className="shrink-0 text-[11px] tabular-nums text-gray-300 w-10 text-right">{clock(g.endedAt)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
