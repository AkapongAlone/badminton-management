import { useParams, Link } from 'react-router-dom'
import { useSessionState } from '../hooks'
import Avatar from '../components/Avatar'
import SkillBadge from '../components/SkillBadge'
import Logo from '../components/Logo'

// Public viewer: all players checked in today + their skill badges.
// Reached from Board.tsx via the "สมาชิก" button.
export default function Members() {
  const { sessionId = '' } = useParams()
  const { state, error } = useSessionState(sessionId)

  if (error && !state) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 p-4">
        ไม่พบก๊วนนี้ ({error})
      </div>
    )
  }
  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        กำลังโหลด…
      </div>
    )
  }

  // Sort by skill descending, then name — so strongest players appear first.
  const active = state.players
    .filter((p) => p.status !== 'checked_out')
    .sort((a, b) => b.skill - a.skill || a.name.localeCompare(b.name, 'th'))

  const gone = state.players
    .filter((p) => p.status === 'checked_out')
    .sort((a, b) => b.skill - a.skill || a.name.localeCompare(b.name, 'th'))

  const all = [...active, ...gone]

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-10">
      <header className="px-4 py-4">
        <div className="flex items-center gap-3">
          <Link to={`/s/${sessionId}`} className="text-gray-400 hover:text-white text-lg leading-none">
            ←
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Logo size="sm" light />
              <h1 className="font-bold">{state.session.groupName}</h1>
            </div>
            <p className="text-xs text-gray-500">
              สมาชิกวันนี้ · {active.length} คน{gone.length > 0 ? ` (กลับแล้ว ${gone.length})` : ''}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-3">
        {all.length === 0 ? (
          <div className="rounded-2xl bg-gray-800 p-8 text-center text-sm text-gray-600">
            ยังไม่มีผู้เล่นเช็คอิน
          </div>
        ) : (
          <div className="rounded-2xl bg-gray-800 divide-y divide-gray-700/50">
            {all.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 ${p.status === 'checked_out' ? 'opacity-40' : ''}`}
              >
                <Avatar name={p.name} seed={p.avatarSeed} size={9} />
                <span className="flex-1 font-medium">{p.name}</span>
                {p.status === 'playing' && (
                  <span className="text-[10px] text-blue-400 font-medium">กำลังเล่น</span>
                )}
                {p.status === 'waiting' && (
                  <span className="text-[10px] text-amber-400">รอ</span>
                )}
                <SkillBadge skill={p.skill} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
