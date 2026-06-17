import { useState } from 'react'
import Modal from './Modal'
import SkillBadge from './SkillBadge'
import type { AiMatch, AiSuggestion, StatePlayer } from '../types'

// "ขอไอเดียจาก AI": ask Claude to arrange one or more 2v2 matches from the waiting
// players, optionally guided by a free-text prompt. Results land here for review;
// the organizer adds the ones they like to the queue (per match or all at once).
export default function AiSuggestModal({
  playersById,
  maxPairs,
  onRequest,
  onAddToQueue,
  onClose,
}: {
  playersById: Map<string, StatePlayer>
  maxPairs: number
  onRequest: (count: number, prompt: string, avoid?: AiMatch[]) => Promise<AiSuggestion>
  onAddToQueue: (teamA: string[], teamB: string[]) => Promise<void>
  onClose: () => void
}) {
  // The server caps matches at floor(waiting / 4); mirror that here so the stepper
  // can't ask for more pairs than there are players to fill them.
  const maxCount = Math.max(1, maxPairs)
  const [count, setCount] = useState(Math.min(2, maxCount))
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AiSuggestion | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [adding, setAdding] = useState(false)
  // Every pairing suggested so far this session, fed back on "ขอใหม่อีกครั้ง" so the
  // model tries a fresh arrangement instead of repeating itself.
  const [seen, setSeen] = useState<AiMatch[]>([])

  const name = (id: string) => playersById.get(id)?.name ?? '?'

  const teamSkill = (ids: string[]) => ids.reduce((sum, id) => sum + (playersById.get(id)?.skill ?? 0), 0)

  // Rate how lopsided a match is from the two teams' combined skill, so the
  // organizer can see at a glance which side is favoured and by how much.
  const balance = (m: AiMatch) => {
    const a = teamSkill(m.teamA)
    const b = teamSkill(m.teamB)
    const diff = Math.abs(a - b)
    const favoured = a === b ? null : a > b ? 'A' : 'B'
    let label: string
    let tone: string
    if (diff === 0) {
      label = 'สูสีมาก'
      tone = 'bg-emerald-100 text-emerald-700'
    } else if (diff <= 2) {
      label = `ทีม ${favoured} ได้เปรียบนิดหน่อย`
      tone = 'bg-amber-50 text-amber-700'
    } else if (diff <= 4) {
      label = `ทีม ${favoured} ได้เปรียบ`
      tone = 'bg-orange-100 text-orange-700'
    } else {
      label = `ทีม ${favoured} ได้เปรียบชัดเจน`
      tone = 'bg-red-100 text-red-700'
    }
    return { a, b, diff, label, tone }
  }

  // Render a team as name + skill chip per player, so the organizer can eyeball
  // how balanced the AI's pairing actually is.
  const renderTeam = (ids: string[]) => (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 align-middle">
      {ids.map((id, j) => (
        <span key={id} className="inline-flex items-center gap-1">
          {j > 0 && <span className="text-gray-300">+</span>}
          <span>{name(id)}</span>
          <SkillBadge skill={playersById.get(id)?.skill ?? 0} size="xs" />
        </span>
      ))}
    </span>
  )

  const ask = async () => {
    setLoading(true)
    setError(null)
    setAdded(new Set())
    try {
      const res = await onRequest(count, prompt.trim(), seen)
      setResult(res)
      setSeen((prev) => [...prev, ...res.matches])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const addOne = async (i: number, m: AiMatch) => {
    setAdding(true)
    try {
      await onAddToQueue(m.teamA, m.teamB)
      setAdded((prev) => new Set(prev).add(i))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  const addAll = async () => {
    if (!result) return
    setAdding(true)
    try {
      const next = new Set(added)
      for (let i = 0; i < result.matches.length; i++) {
        if (next.has(i)) continue
        await onAddToQueue(result.matches[i].teamA, result.matches[i].teamB)
        next.add(i)
      }
      setAdded(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  const allAdded = result != null && result.matches.length > 0 && added.size === result.matches.length

  return (
    <Modal title="🤖 ขอไอเดียจาก AI" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">จัดให้กี่คู่?</span>
          <div className="flex items-center gap-3">
            <button type="button" disabled={count <= 1} onClick={() => setCount((c) => Math.max(1, c - 1))}
              className="h-9 w-9 rounded-full border border-gray-300 text-xl text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-white">−</button>
            <span className="w-8 text-center text-2xl font-bold tabular-nums">{count}</span>
            <button type="button" disabled={count >= maxCount} onClick={() => setCount((c) => Math.min(maxCount, c + 1))}
              className="h-9 w-9 rounded-full border border-gray-300 text-xl text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-white">+</button>
            <span className="text-xs text-gray-400">(สูงสุด {maxPairs} คู่ตอนนี้)</span>
          </div>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">คำสั่งเพิ่มเติม (ใส่หรือไม่ก็ได้)</span>
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="เช่น จับมือใกล้กันให้สูสี, ให้คนรอนานได้เล่นก่อน, อย่าจับ A คู่กับ B"
          />
        </label>

        <button
          disabled={loading || adding}
          onClick={ask}
          className="w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {loading ? 'AI กำลังคิด…' : result ? '🔄 ขอใหม่อีกครั้ง' : '✨ ขอไอเดีย'}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {result && (
          <div className="space-y-2 border-t border-gray-100 pt-3">
            {result.note && <p className="text-xs text-gray-500 italic">💡 {result.note}</p>}
            {result.matches.map((m, i) => (
              <div key={i} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                    <span className="text-gray-400 text-xs mr-0.5">#{i + 1}</span>
                    <span className="font-medium text-emerald-700">A:</span> {renderTeam(m.teamA)}
                    <span className="mx-1 text-gray-300">vs</span>
                    <span className="font-medium text-sky-700">B:</span> {renderTeam(m.teamB)}
                  </div>
                  {added.has(i) ? (
                    <span className="shrink-0 text-xs font-medium text-emerald-600">✓ เพิ่มแล้ว</span>
                  ) : (
                    <button
                      disabled={adding}
                      onClick={() => addOne(i, m)}
                      className="shrink-0 rounded-lg bg-gray-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
                    >
                      เพิ่มลงคิว
                    </button>
                  )}
                </div>
                {(() => {
                  const bal = balance(m)
                  return (
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500" data-testid={`match-balance-${i}`}>
                      <span>
                        รวมมือ <span className="font-semibold text-emerald-700">{bal.a}</span>
                        <span className="mx-1 text-gray-300">–</span>
                        <span className="font-semibold text-sky-700">{bal.b}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${bal.tone}`}>
                        {bal.diff > 0 ? `${bal.label} (+${bal.diff})` : bal.label}
                      </span>
                    </div>
                  )
                })()}
              </div>
            ))}

            {result.matches.length > 1 && (
              <button
                disabled={adding || allAdded}
                onClick={addAll}
                className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {allAdded ? 'เพิ่มครบทุกคู่แล้ว ✓' : 'เพิ่มทั้งหมดลงคิว →'}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
