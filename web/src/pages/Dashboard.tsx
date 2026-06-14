import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api, adminUrl } from '../api'
import { fmtBaht, useSessionState } from '../hooks'
import ConfigForm from '../components/ConfigForm'
import MatchBuilderCard from '../components/MatchBuilderCard'
import QueuePanel from '../components/QueuePanel'
import Modal from '../components/Modal'
import PlayerTable from '../components/PlayerTable'
import SummaryPanel from '../components/SummaryPanel'
import Toasts, { type Toast } from '../components/Toasts'
import CheckinModal from '../components/CheckinModal'
import type { StatePlayer } from '../types'

let toastSeq = 1

function ShuttleInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))}
        className="h-12 w-12 rounded-full border border-gray-300 text-2xl text-gray-600 hover:bg-gray-50">−</button>
      <span className="w-16 text-center text-4xl font-bold tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)}
        className="h-12 w-12 rounded-full border border-gray-300 text-2xl text-gray-600 hover:bg-gray-50">+</button>
    </div>
  )
}

export default function Dashboard({
  groupId,
  sessionId,
  adminKey,
  onBack,
}: {
  groupId: string
  sessionId: string
  adminKey: string
  onBack: () => void
}) {
  const { state, error, refresh, serverNow } = useSessionState(sessionId, adminKey)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [tab, setTab] = useState<'dashboard' | 'queue'>('dashboard')
  const [builderA, setBuilderA] = useState<string[]>([])
  const [builderB, setBuilderB] = useState<string[]>([])
  const [endGameTarget, setEndGameTarget] = useState<string | null>(null) // gameId
  const [endGameShuttles, setEndGameShuttles] = useState(1)
  const [shuttleEdit, setShuttleEdit] = useState<StatePlayer | null>(null)
  const [shuttleEditVal, setShuttleEditVal] = useState(0)
  const [checkoutTarget, setCheckoutTarget] = useState<StatePlayer | null>(null)
  const [showCheckin, setShowCheckin] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const pushToast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = toastSeq++
    setToasts((ts) => [...ts, { id, message, kind }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 8000)
  }, [])
  const onError = useCallback((msg: string) => pushToast(msg, 'error'), [pushToast])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      await refresh()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Passive wait-time alerts
  const stateRef = useRef(state)
  stateRef.current = state
  const alertedRef = useRef(new Set<string>())
  useEffect(() => {
    const t = setInterval(() => {
      const st = stateRef.current
      if (!st || st.session.status !== 'open') return
      const threshold = st.session.config.waitAlertMinutes * 60_000
      for (const p of st.players) {
        if (p.status !== 'waiting') { alertedRef.current.delete(p.id); continue }
        if (serverNow() - p.waitingSince >= threshold && !alertedRef.current.has(p.id)) {
          alertedRef.current.add(p.id)
          pushToast(`⏰ ${p.name} รอเกิน ${st.session.config.waitAlertMinutes} นาทีแล้ว`, 'alert')
        }
      }
    }, 1000)
    return () => clearInterval(t)
  }, [pushToast, serverNow])

  if (error && !state) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">โหลดไม่สำเร็จ: {error}</div>
  }
  if (!state) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด…</div>
  }

  const open = state.session.status === 'open'
  const playersById = new Map(state.players.map((p) => [p.id, p]))
  const checkedInRosterIds = new Set(state.players.map((p) => p.rosterPlayerId))
  const publicUrl = `${location.origin}/s/${sessionId}`

  // ---- match builder toggles ----
  const toggleA = (id: string) => {
    setBuilderA((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return prev
      // remove from B if already there
      setBuilderB((b) => b.filter((x) => x !== id))
      return [...prev, id]
    })
  }
  const toggleB = (id: string) => {
    setBuilderB((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return prev
      setBuilderA((a) => a.filter((x) => x !== id))
      return [...prev, id]
    })
  }
  const clearBuilder = () => { setBuilderA([]); setBuilderB([]) }

  const addToQueue = () =>
    run(async () => {
      await api.addToMatchQueue(sessionId, adminKey, builderA, builderB)
      clearBuilder()
      pushToast('เพิ่มลงคิวเกมแล้ว', 'info')
    })

  // "ขอ idea" → fill the builder with a suggestion; the organizer reviews and
  // presses "เพิ่มลงคิว" to confirm (no auto-add).
  const handleSuggest = () =>
    run(async () => {
      const sug = await api.suggest(sessionId, adminKey)
      setBuilderA(sug.teamA)
      setBuilderB(sug.teamB)
      const names = (ids: string[]) => ids.map((id) => playersById.get(id)?.name ?? '?').join(' + ')
      pushToast(`💡 idea: A: ${names(sug.teamA)} vs B: ${names(sug.teamB)} — กด "เพิ่มลงคิว" เพื่อยืนยัน`, 'info')
    })

  const startFromQueue = (mqId: string, courtId: string) =>
    run(() => api.startFromMatchQueue(mqId, adminKey, courtId))

  const cancelFromQueue = (mqId: string) =>
    run(() => api.removeFromMatchQueue(mqId, adminKey))

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />

      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-2">
          <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600">←</button>
          <h1 className="font-bold text-lg">{state.session.groupName}</h1>
          <span className="text-sm text-gray-400">{state.session.date}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${open ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
            {open ? 'เปิดอยู่' : 'ปิดแล้ว'}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => { navigator.clipboard.writeText(adminUrl(groupId, adminKey)); pushToast('คัดลอกลิงก์แอดมินแล้ว') }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            คัดลอกลิงก์แอดมิน
          </button>
          {open && <>
            <button onClick={() => setShowConfig(true)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              ตั้งค่า
            </button>
            <button onClick={() => setShowCloseConfirm(true)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
              ปิดก๊วน
            </button>
          </>}
        </div>
      </header>

      {/* Tab nav */}
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div className="flex gap-1 rounded-xl bg-gray-200/70 p-1 text-sm font-medium">
          <button
            onClick={() => setTab('dashboard')}
            className={`flex-1 rounded-lg py-2 transition-colors ${tab === 'dashboard' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            แดชบอร์ด
          </button>
          <button
            onClick={() => setTab('queue')}
            className={`flex-1 rounded-lg py-2 transition-colors ${tab === 'queue' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            คิว{state.matchQueue.length > 0 && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">{state.matchQueue.length}</span>}
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-4">
        {!open && (
          <div className="mb-4 rounded-2xl bg-gray-800 px-4 py-3 text-sm text-white">
            ก๊วนวันนี้ปิดแล้ว — ยังติ๊กจ่ายเงินได้ และบอร์ดสาธารณะยังเปิดดูได้
          </div>
        )}

        {tab === 'dashboard' && (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            {/* Left: QR + summary */}
            <div className="space-y-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm text-center">
                <div className="text-sm font-semibold text-gray-700 mb-2">สแกนดูบอร์ดสด 📱</div>
                <div className="flex justify-center">
                  <QRCodeSVG value={publicUrl} size={180} marginSize={1} />
                </div>
                <p className="mt-2 text-xs text-gray-400">ให้นักตีสแกนดูคิว/ยอดของตัวเอง</p>
              </div>
              {state.summary && <SummaryPanel summary={state.summary} config={state.session.config} />}
            </div>

            {/* Right: players */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-700">ผู้เล่น ({state.players.length})</h2>
                {open && (
                  <button onClick={() => setShowCheckin(true)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">
                    + เช็คอิน
                  </button>
                )}
              </div>

              <PlayerTable
                players={state.players}
                serverNow={serverNow}
                sessionOpen={open}
                waitAlertMinutes={state.session.config.waitAlertMinutes}
                onTogglePaid={(p) => run(() => api.patchPlayer(p.id, adminKey, { paid: !p.paid }))}
                onCheckout={(p) => setCheckoutTarget(p)}
                onEditShuttles={(p) => { setShuttleEditVal(p.shuttlesUsed); setShuttleEdit(p) }}
              />
            </div>
          </div>
        )}

        {tab === 'queue' && (
          <div className="space-y-4">
            {open && (
              <MatchBuilderCard
                players={state.players}
                teamA={builderA}
                teamB={builderB}
                serverNow={serverNow}
                onToggleA={toggleA}
                onToggleB={toggleB}
                onAddToQueue={addToQueue}
                onSuggest={handleSuggest}
                onClear={clearBuilder}
                busy={busy}
              />
            )}

            <QueuePanel
              courts={state.courts}
              queue={state.matchQueue}
              history={state.history}
              playersById={playersById}
              sessionOpen={open}
              serverNow={serverNow}
              onStart={startFromQueue}
              onCancel={cancelFromQueue}
              onEndGame={(gameId) => { setEndGameShuttles(1); setEndGameTarget(gameId) }}
              onCloseCourt={(courtId) => { if (confirm('ปิดสนามนี้?')) run(() => api.patchCourt(courtId, adminKey, 'closed')) }}
              onAddCourt={() => run(() => api.addCourt(sessionId, adminKey))}
            />
          </div>
        )}
      </main>

      {/* ---- modals ---- */}

      {endGameTarget && (
        <Modal title="จบเกม — เปิดลูกใหม่ไปกี่ลูก?" onClose={() => setEndGameTarget(null)}>
          <div className="space-y-4">
            <ShuttleInput value={endGameShuttles} onChange={setEndGameShuttles} />
            <p className="text-center text-xs text-gray-400">นับเฉพาะลูกที่เปิดใหม่ในเกมนี้ — ใช้ลูกเก่าต่อ = 0 ได้</p>
            <button
              disabled={busy}
              onClick={() => { const id = endGameTarget; setEndGameTarget(null); run(() => api.endGame(id, adminKey, endGameShuttles)) }}
              className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              ยืนยันจบเกม
            </button>
          </div>
        </Modal>
      )}

      {shuttleEdit && (
        <Modal title={`แก้จำนวนลูกของ ${shuttleEdit.name}`} onClose={() => setShuttleEdit(null)}>
          <div className="space-y-4">
            <ShuttleInput value={shuttleEditVal} onChange={setShuttleEditVal} />
            <p className="text-center text-xs text-gray-400">จำนวนลูกสะสมทั้งวัน (ใช้แก้ที่กดพลาดเท่านั้น)</p>
            <button
              disabled={busy}
              onClick={() => { const p = shuttleEdit; setShuttleEdit(null); run(() => api.patchPlayer(p.id, adminKey, { shuttlesUsed: shuttleEditVal })) }}
              className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              บันทึก
            </button>
          </div>
        </Modal>
      )}

      {checkoutTarget && (
        <Modal title="เช็คเอาท์" onClose={() => setCheckoutTarget(null)}>
          <div className="space-y-4 text-center">
            <p><span className="font-semibold">{checkoutTarget.name}</span> กลับบ้าน — ยอดที่ต้องจ่าย</p>
            <div className="text-4xl font-bold text-emerald-700">{fmtBaht(checkoutTarget.total)}</div>
            <p className="text-xs text-gray-400">{checkoutTarget.gamesPlayed} เกม · {checkoutTarget.shuttlesUsed} ลูก</p>
            <button
              disabled={busy}
              onClick={() => { const p = checkoutTarget; setCheckoutTarget(null); run(() => api.checkout(p.id, adminKey)) }}
              className="w-full rounded-lg bg-gray-800 py-2.5 font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
            >
              ยืนยันเช็คเอาท์
            </button>
          </div>
        </Modal>
      )}

      {showCheckin && (
        <CheckinModal
          groupId={groupId}
          sessionId={sessionId}
          adminKey={adminKey}
          checkedInRosterIds={checkedInRosterIds}
          onClose={() => setShowCheckin(false)}
          onDone={refresh}
          onError={onError}
        />
      )}

      {showConfig && (
        <Modal title="ตั้งค่าก๊วนวันนี้" onClose={() => setShowConfig(false)}>
          <ConfigForm
            initial={state.session.config}
            submitLabel="บันทึกตั้งค่า"
            busy={busy}
            onSubmit={(cfg) => { setShowConfig(false); run(() => api.patchSessionConfig(sessionId, adminKey, cfg)) }}
          />
        </Modal>
      )}

      {showCloseConfirm && (
        <Modal title="ปิดก๊วนวันนี้?" onClose={() => setShowCloseConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              ปิดแล้วจะเช็คอิน/เริ่มเกม/แก้ลูกไม่ได้อีก แต่ยังติ๊กจ่ายเงินได้และบอร์ดสาธารณะยังดูได้
            </p>
            <button
              disabled={busy}
              onClick={() => { setShowCloseConfirm(false); run(() => api.closeSession(sessionId, adminKey)) }}
              className="w-full rounded-lg bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ยืนยันปิดก๊วน
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
