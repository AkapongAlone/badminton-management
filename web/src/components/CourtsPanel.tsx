import { fmtElapsed } from '../hooks'
import type { StateCourt, StatePlayer } from '../types'

export default function CourtsPanel({
  courts,
  playersById,
  sessionOpen,
  serverNow,
  onEndGame,
  onCloseCourt,
  onAddCourt,
}: {
  courts: StateCourt[]
  playersById: Map<string, StatePlayer>
  sessionOpen: boolean
  serverNow: () => number
  onEndGame: (gameId: string) => void
  onCloseCourt: (courtId: string) => void
  onAddCourt: () => void
}) {
  const name = (id: string) => playersById.get(id)?.name ?? '?'

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-gray-700">สนาม</h2>
        {sessionOpen && (
          <button
            onClick={onAddCourt}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            + เพิ่มสนาม
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {courts.map((court) => {
          if (court.status === 'closed') {
            return (
              <div key={court.id} className="rounded-2xl border border-dashed border-gray-200 p-4 opacity-40">
                <div className="font-semibold text-gray-500">{court.label}</div>
                <div className="text-xs text-gray-400 mt-1">ปิดแล้ว</div>
              </div>
            )
          }

          return (
            <div key={court.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{court.label}</div>
                {!court.game && sessionOpen && (
                  <button
                    onClick={() => onCloseCourt(court.id)}
                    className="text-xs text-gray-300 hover:text-red-500"
                    title="ปิดสนามนี้"
                  >
                    ปิดสนาม
                  </button>
                )}
              </div>

              {court.game ? (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between text-xs text-blue-600">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium">กำลังเล่น</span>
                    <span className="tabular-nums font-mono">{fmtElapsed(serverNow() - court.game.startedAt)}</span>
                  </div>
                  <div className="text-sm">
                    <div><span className="text-emerald-600 font-medium text-xs">A</span> {court.game.teamA.map(name).join(' + ')}</div>
                    <div className="text-center text-[10px] text-gray-300 my-0.5">vs</div>
                    <div><span className="text-sky-600 font-medium text-xs">B</span> {court.game.teamB.map(name).join(' + ')}</div>
                  </div>
                  {sessionOpen && (
                    <button
                      onClick={() => onEndGame(court.game!.id)}
                      className="w-full rounded-lg bg-blue-600 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      จบเกม
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-xs text-gray-400">
                  ว่าง — เลือกเกมจากคิวด้านล่างเพื่อเริ่ม
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
