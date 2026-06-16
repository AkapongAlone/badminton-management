import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import Avatar from './Avatar'
import Modal from './Modal'
import SkillBadge from './SkillBadge'
import { SKILL_LABELS, skillClass } from '../types'
import type { RosterPlayer } from '../types'

interface PendingPlayer {
  key: string // unique per pending entry
  rosterPlayerId?: string
  name: string
  skill: number
  avatarSeed: string
  note: string
}

export default function CheckinModal({
  groupId,
  sessionId,
  adminKey,
  checkedInRosterIds,
  onClose,
  onDone,
  onError,
}: {
  groupId: string
  sessionId: string
  adminKey: string
  checkedInRosterIds: Set<string>
  onClose: () => void
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [q, setQ] = useState('')
  const [newSkill, setNewSkill] = useState(2)
  const [pending, setPending] = useState<PendingPlayer[]>([])
  const [busy, setBusy] = useState(false)

  const loadRoster = useCallback(() => {
    api.listRoster(groupId, adminKey).then(setRoster).catch((e) => onError(String(e.message ?? e)))
  }, [groupId, adminKey, onError])

  useEffect(() => { loadRoster() }, [loadRoster])

  const pendingRosterIds = useMemo(() => new Set(pending.map((p) => p.rosterPlayerId).filter(Boolean)), [pending])

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    return roster.filter(
      (r) => !checkedInRosterIds.has(r.id) && !pendingRosterIds.has(r.id) &&
             (!term || r.name.toLowerCase().includes(term)),
    )
  }, [roster, q, checkedInRosterIds, pendingRosterIds])

  const exactMatch = roster.some((r) => r.name.toLowerCase() === q.trim().toLowerCase())

  const addExisting = (r: RosterPlayer) => {
    setPending((prev) => [...prev, { key: r.id, rosterPlayerId: r.id, name: r.name, skill: r.skill, avatarSeed: r.avatarSeed, note: '' }])
    setQ('')
  }

  const addNew = () => {
    const name = q.trim()
    if (!name) return
    setPending((prev) => [...prev, { key: `new-${Date.now()}`, name, skill: newSkill, avatarSeed: name, note: '' }])
    setQ('')
    setNewSkill(2)
  }

  const removePending = (key: string) => setPending((prev) => prev.filter((p) => p.key !== key))

  const updateNote = (key: string, note: string) =>
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, note } : p)))

  const checkinAll = async () => {
    if (pending.length === 0) return
    setBusy(true)
    let failed = 0
    for (const p of pending) {
      try {
        await api.checkIn(sessionId, adminKey, {
          rosterPlayerId: p.rosterPlayerId,
          name: p.name,
          skill: p.skill,
          note: p.note,
        })
      } catch (e) {
        failed++
        onError(`${p.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setBusy(false)
    if (failed < pending.length) {
      onDone()
      if (failed === 0) onClose()
      else setPending((prev) => prev.filter((_, i) => i >= pending.length - failed))
    }
  }

  return (
    <Modal title="เช็คอินผู้เล่น" onClose={onClose}>
      {/* Search / new player input */}
      <input
        autoFocus
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        placeholder="พิมพ์ชื่อเพื่อค้นหา หรือพิมพ์ชื่อใหม่…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && q.trim() && !exactMatch) addNew() }}
      />

      {/* Roster matches */}
      {matches.length > 0 && (
        <div className="mt-2 max-h-44 overflow-y-auto divide-y divide-gray-50 rounded-xl border border-gray-100">
          {matches.map((r) => (
            <button
              key={r.id}
              onClick={() => addExisting(r)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-emerald-50"
            >
              <Avatar name={r.name} seed={r.avatarSeed} size={8} />
              <span className="flex-1 font-medium text-sm">{r.name}</span>
              <SkillBadge skill={r.skill} />
              <span className="text-emerald-600 text-xs font-medium">+ เพิ่ม</span>
            </button>
          ))}
        </div>
      )}

      {/* Create new */}
      {q.trim() !== '' && !exactMatch && (
        <div className="mt-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3 space-y-2">
          <div className="text-sm font-medium">
            เพิ่มคนใหม่: <span className="text-emerald-700">{q.trim()}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-gray-400">มือ:</span>
            {SKILL_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setNewSkill(i + 1)}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition ${skillClass(i + 1)} ${
                  newSkill === i + 1 ? 'ring-2 ring-offset-1 ring-gray-800' : 'opacity-40 hover:opacity-70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={addNew}
            className="w-full rounded-lg bg-emerald-600 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + เพิ่มลงรายการ
          </button>
        </div>
      )}

      {/* Pending list */}
      {pending.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">รายการที่จะเช็คอิน ({pending.length})</div>
          {pending.map((p) => (
            <div key={p.key} className="flex items-start gap-2 rounded-xl bg-gray-50 p-2">
              <Avatar name={p.name} seed={p.avatarSeed} size={8} />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm truncate">{p.name}</span>
                  <SkillBadge skill={p.skill} size="xs" />
                  {!p.rosterPlayerId && <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-700">ใหม่</span>}
                </div>
                <input
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  placeholder="หมายเหตุ (ไม่บังคับ) เช่น มาสาย, ขาแพลง…"
                  value={p.note}
                  onChange={(e) => updateNote(p.key, e.target.value)}
                />
              </div>
              <button onClick={() => removePending(p.key)} className="text-gray-300 hover:text-red-500 text-lg leading-none px-0.5">✕</button>
            </div>
          ))}
          <button
            disabled={busy}
            onClick={checkinAll}
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'กำลังเช็คอิน…' : `เช็คอิน ${pending.length} คน`}
          </button>
        </div>
      )}

      {pending.length === 0 && matches.length === 0 && q.trim() === '' && (
        <p className="mt-3 py-3 text-center text-sm text-gray-400">พิมพ์ชื่อเพื่อค้นหาหรือเพิ่มคนใหม่</p>
      )}
    </Modal>
  )
}
