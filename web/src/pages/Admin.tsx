import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, adminUrl, loadAdmin, saveAdmin } from '../api'
import Avatar from '../components/Avatar'
import ConfigForm from '../components/ConfigForm'
import Modal from '../components/Modal'
import Dashboard from './Dashboard'
import { SKILL_LABELS, skillLabel } from '../types'
import type { GroupInfo, RosterPlayer } from '../types'

export default function Admin() {
  const { groupId = '' } = useParams()
  const [searchParams] = useSearchParams()

  // Token comes from the URL on first visit, then lives in localStorage.
  const urlKey = searchParams.get('key')
  const saved = loadAdmin()
  const key = urlKey || (saved?.groupId === groupId ? saved.key : '')
  useEffect(() => {
    if (urlKey && groupId) saveAdmin(groupId, urlKey)
  }, [urlKey, groupId])

  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'home' | 'dashboard'>('home')
  const [viewSessionId, setViewSessionId] = useState<string | null>(null)

  const refreshGroup = useCallback(async () => {
    if (!groupId || !key) return
    try {
      const g = await api.getGroup(groupId, key)
      setGroup(g)
      setError(null)
      return g
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [groupId, key])

  useEffect(() => {
    refreshGroup().then((g) => {
      if (g?.currentSession?.status === 'open') {
        setViewSessionId(g.currentSession.id)
        setView('dashboard')
      }
    })
  }, [refreshGroup])

  if (!key) {
    return (
      <Center>
        <p>ไม่พบสิทธิ์แอดมินของก๊วนนี้ — ต้องเปิดผ่านลิงก์แอดมินที่มี key</p>
        <Link to="/" className="text-emerald-600 underline">
          กลับหน้าแรก
        </Link>
      </Center>
    )
  }
  if (error) {
    return (
      <Center>
        <p>เข้าไม่ได้: {error}</p>
        <Link to="/" className="text-emerald-600 underline">
          กลับหน้าแรก
        </Link>
      </Center>
    )
  }
  if (!group) {
    return <Center>กำลังโหลด…</Center>
  }

  if (view === 'dashboard' && viewSessionId) {
    return (
      <Dashboard
        groupId={groupId}
        sessionId={viewSessionId}
        adminKey={key}
        onBack={() => {
          setView('home')
          refreshGroup()
        }}
      />
    )
  }

  return (
    <GroupHome
      group={group}
      adminKey={key}
      onOpenDashboard={(sessionId) => {
        setViewSessionId(sessionId)
        setView('dashboard')
      }}
      refreshGroup={refreshGroup}
    />
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 p-4 text-gray-500">
      {children}
    </div>
  )
}

function GroupHome({
  group,
  adminKey,
  onOpenDashboard,
  refreshGroup,
}: {
  group: GroupInfo
  adminKey: string
  onOpenDashboard: (sessionId: string) => void
  refreshGroup: () => void
}) {
  const [showOpenSession, setShowOpenSession] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [editPlayer, setEditPlayer] = useState<RosterPlayer | null>(null)
  const [showAddPlayer, setShowAddPlayer] = useState(false)

  const loadRoster = useCallback(() => {
    api.listRoster(group.id, adminKey).then(setRoster).catch(() => {})
  }, [group.id, adminKey])
  useEffect(loadRoster, [loadRoster])

  const openSession = async (config: GroupInfo['config'], courts: number) => {
    setBusy(true)
    try {
      const res = await api.createSession(group.id, adminKey, config, courts)
      onOpenDashboard(res.sessionId)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const hasOpen = group.currentSession?.status === 'open'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">🏸</span>
          <h1 className="text-xl font-bold flex-1">{group.name}</h1>
          <button
            onClick={() => {
              navigator.clipboard.writeText(adminUrl(group.id, adminKey))
              setMsg('คัดลอกลิงก์แอดมินแล้ว')
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            คัดลอกลิงก์แอดมิน
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          ⚠️ เก็บลิงก์แอดมินไว้ในที่ปลอดภัย — ใครมีลิงก์นี้คือเจ้าของก๊วน และถ้าลิงก์หายจะกู้คืนไม่ได้
        </div>

        {msg && (
          <div className="rounded-xl bg-gray-800 px-4 py-3 text-sm text-white" onClick={() => setMsg(null)}>
            {msg}
          </div>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm space-y-3">
          {hasOpen ? (
            <button
              onClick={() => onOpenDashboard(group.currentSession!.id)}
              className="w-full rounded-xl bg-emerald-600 py-3 text-lg font-bold text-white hover:bg-emerald-700"
            >
              เข้าก๊วนวันนี้ ({group.currentSession!.date}) →
            </button>
          ) : (
            <button
              onClick={() => setShowOpenSession(true)}
              className="w-full rounded-xl bg-emerald-600 py-3 text-lg font-bold text-white hover:bg-emerald-700"
            >
              เปิดก๊วนวันนี้ 🏸
            </button>
          )}
          {group.currentSession && !hasOpen && (
            <button
              onClick={() => onOpenDashboard(group.currentSession!.id)}
              className="w-full rounded-xl border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              ดูก๊วนล่าสุด ({group.currentSession.date} — ปิดแล้ว) เช่น ติ๊กคนโอนตามหลัง
            </button>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">ทะเบียนนักตี ({roster.length})</h2>
            <button
              onClick={() => setShowAddPlayer(true)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              + เพิ่มนักตี
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {roster.map((r) => (
              <button
                key={r.id}
                onClick={() => setEditPlayer(r)}
                className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-gray-50 rounded-lg px-2"
              >
                <Avatar name={r.name} seed={r.avatarSeed} size={9} />
                <span className="flex-1 font-medium">{r.name}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{skillLabel(r.skill)}</span>
                <span className="text-xs text-gray-300">แก้ไข</span>
              </button>
            ))}
            {roster.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                ยังไม่มีนักตีในทะเบียน — เพิ่มได้เลย หรือเพิ่มตอนเช็คอินหน้างานก็ได้
              </p>
            )}
          </div>
        </section>
      </main>

      {showOpenSession && (
        <Modal title="เปิดก๊วนวันนี้" onClose={() => setShowOpenSession(false)}>
          <ConfigForm
            initial={group.config}
            withCourts={{ initial: 2 }}
            submitLabel="เปิดก๊วน"
            busy={busy}
            onSubmit={openSession}
          />
        </Modal>
      )}

      {showAddPlayer && (
        <RosterPlayerModal
          title="เพิ่มนักตี"
          initialName=""
          initialSkill={3}
          onClose={() => setShowAddPlayer(false)}
          onSubmit={async (name, skill) => {
            await api.addRoster(group.id, adminKey, name, skill)
            setShowAddPlayer(false)
            loadRoster()
          }}
        />
      )}

      {editPlayer && (
        <RosterPlayerModal
          title={`แก้ไข ${editPlayer.name}`}
          initialName={editPlayer.name}
          initialSkill={editPlayer.skill}
          onClose={() => setEditPlayer(null)}
          onSubmit={async (name, skill) => {
            await api.patchRoster(editPlayer.id, adminKey, { name, skill })
            setEditPlayer(null)
            loadRoster()
            refreshGroup()
          }}
        />
      )}
    </div>
  )
}

function RosterPlayerModal({
  title,
  initialName,
  initialSkill,
  onClose,
  onSubmit,
}: {
  title: string
  initialName: string
  initialSkill: number
  onClose: () => void
  onSubmit: (name: string, skill: number) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [skill, setSkill] = useState(initialSkill)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">ชื่อ</span>
          <input
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">มือ (ระดับฝีมือ)</span>
          <div className="flex flex-wrap gap-1">
            {SKILL_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSkill(i + 1)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  skill === i + 1 ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true)
            setErr(null)
            try {
              await onSubmit(name.trim(), skill)
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e))
              setBusy(false)
            }
          }}
          className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          บันทึก
        </button>
      </div>
    </Modal>
  )
}
