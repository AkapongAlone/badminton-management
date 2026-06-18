import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import SkillBadge from '../components/SkillBadge'
import Logo from '../components/Logo'
import type { PlayerStat } from '../types'

type SortKey = 'winRate' | 'wins' | 'totalGames' | 'name'

export default function Stats() {
  const { groupId = '' } = useParams()
  const [stats, setStats] = useState<PlayerStat[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('winRate')

  useEffect(() => {
    api.getGroupStats(groupId)
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [groupId])

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 p-4">{error}</div>
  }
  if (!stats) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด…</div>
  }

  const sorted = [...stats].sort((a, b) => {
    if (sort === 'winRate') {
      // Primary: win rate desc; secondary: games with result desc so players with more data rank higher
      if (b.winRate !== a.winRate) return b.winRate - a.winRate
      return b.games - a.games
    }
    if (sort === 'wins') return b.wins - a.wins
    if (sort === 'totalGames') return b.totalGames - a.totalGames
    return a.name.localeCompare(b.name, 'th')
  })

  const SORTS: { key: SortKey; label: string }[] = [
    { key: 'winRate', label: '% ชนะ' },
    { key: 'wins', label: 'ชนะมากสุด' },
    { key: 'totalGames', label: 'เล่นมากสุด' },
    { key: 'name', label: 'ชื่อ' },
  ]

  const pct = (n: number) => `${Math.round(n * 100)}%`

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-10">
      <header className="px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => history.back()} className="text-gray-400 hover:text-white text-lg leading-none">←</button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Logo size="sm" light />
              <h1 className="font-bold">สถิติก๊วน</h1>
            </div>
            <p className="text-xs text-gray-500">
              {stats.length} คน · ข้อมูลรวมทุก session
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-3 space-y-3">
        {/* Sort tabs */}
        <div className="flex gap-1 rounded-xl bg-gray-800/60 p-1 text-xs font-medium">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`flex-1 rounded-lg py-1.5 transition-colors ${
                sort === s.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Stats table */}
        <div className="rounded-2xl bg-gray-800 overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-x-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-700">
            <span>#</span>
            <span>ชื่อ</span>
            <span className="text-center">มือ</span>
            <span className="text-center text-emerald-400">W</span>
            <span className="text-center text-gray-500">D</span>
            <span className="text-center text-red-400">L</span>
            <span className="text-right">%ชนะ</span>
          </div>

          {sorted.map((p, i) => {
            const hasResult = p.games > 0
            const winPct = hasResult ? pct(p.winRate) : '—'
            const pctColor = !hasResult ? 'text-gray-600'
              : p.winRate >= 0.6 ? 'text-emerald-400 font-bold'
              : p.winRate >= 0.4 ? 'text-gray-200'
              : 'text-red-400'

            return (
              <div
                key={p.rosterPlayerId}
                className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-x-3 px-4 py-3 border-b border-gray-700/40 last:border-0"
              >
                <span className="text-xs text-gray-500 w-4 text-center">{i + 1}</span>
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  {p.totalGames > 0 && (
                    <div className="text-[10px] text-gray-500">
                      {p.totalGames} เกม
                      {p.games < p.totalGames && ` (${p.totalGames - p.games} ไม่บันทึกผล)`}
                    </div>
                  )}
                </div>
                <div className="flex justify-center"><SkillBadge skill={p.skill} size="xs" /></div>
                <span className="text-center text-sm text-emerald-400 w-6">{p.wins}</span>
                <span className="text-center text-sm text-gray-500 w-6">{p.draws}</span>
                <span className="text-center text-sm text-red-400 w-6">{p.losses}</span>
                <span className={`text-right text-sm tabular-nums w-10 ${pctColor}`}>{winPct}</span>
              </div>
            )
          })}

          {stats.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-600">ยังไม่มีข้อมูลสมาชิก</div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-600">
          % ชนะ คิดจากเกมที่บันทึกผลเท่านั้น
        </p>
      </main>
    </div>
  )
}
