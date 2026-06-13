import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { SessionState } from './types'

// Polls GET /state every 5s; wait clocks tick client-side between polls
// using the server clock offset (state.now - Date.now()).
export function useSessionState(sessionId: string, adminKey?: string) {
  const [state, setState] = useState<SessionState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const offsetRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const st = await api.getState(sessionId, adminKey)
      offsetRef.current = st.now - Date.now()
      setState(st)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [sessionId, adminKey])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  // 1-second tick so elapsed clocks re-render between polls
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const serverNow = useCallback(() => Date.now() + offsetRef.current, [])

  return { state, error, refresh, serverNow }
}

export function fmtElapsed(ms: number): string {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export function fmtBaht(n: number): string {
  return `${n.toLocaleString('th-TH')}฿`
}
