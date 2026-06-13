import type { MatchQueueItem, StateCourt, StatePlayer } from '../types'

// Shows queued matches and free courts. For each queued match the organizer
// picks which free court to start on — the match queue is independent of courts.
export default function MatchQueueList({
  queue,
  courts,
  playersById,
  sessionOpen,
  onStart,
  onCancel,
}: {
  queue: MatchQueueItem[]
  courts: StateCourt[]
  playersById: Map<string, StatePlayer>
  sessionOpen: boolean
  onStart: (mqId: string, courtId: string) => void
  onCancel: (mqId: string) => void
}) {
  const freeCourts = courts.filter((c) => c.status === 'active' && !c.game)
  const name = (id: string) => playersById.get(id)?.name ?? '?'

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-700">คิวเกม</h2>
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

                {sessionOpen && freeCourts.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-gray-400">ไม่มีคอร์ทว่าง — รอจบเกมที่กำลังเล่นอยู่</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
