import type { AiMatch, AiSuggestion, Config, GroupInfo, PlayerStat, RosterPlayer, SessionState, Suggestion } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function http<T>(method: string, url: string, body?: unknown, key?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (key) headers['X-Admin-Token'] = key
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || res.statusText)
  return data as T
}

export const api = {
  createGroup: (name: string, config: Config) =>
    http<{ groupId: string; adminToken: string; adminUrl: string }>('POST', '/api/groups', { name, config }),
  getGroup: (groupId: string, key: string) => http<GroupInfo>('GET', `/api/groups/${groupId}`, undefined, key),
  createSession: (groupId: string, key: string, config: Config, courts: number) =>
    http<{ sessionId: string }>('POST', `/api/groups/${groupId}/sessions`, { config, courts }, key),
  patchSessionConfig: (sessionId: string, key: string, config: Config) =>
    http('PATCH', `/api/sessions/${sessionId}/config`, config, key),
  closeSession: (sessionId: string, key: string) => http('POST', `/api/sessions/${sessionId}/close`, {}, key),
  payAll: (sessionId: string, key: string) => http('POST', `/api/sessions/${sessionId}/pay-all`, {}, key),
  getState: (sessionId: string, key?: string) =>
    http<SessionState>('GET', `/api/sessions/${sessionId}/state`, undefined, key),
  checkIn: (sessionId: string, key: string, body: { rosterPlayerId?: string; name?: string; skill?: number; note?: string }) =>
    http<{ sessionPlayerId: string }>('POST', `/api/sessions/${sessionId}/players`, body, key),
  checkout: (playerId: string, key: string) =>
    http<{ ok: boolean; total: number }>('POST', `/api/players/${playerId}/checkout`, {}, key),
  patchPlayer: (playerId: string, key: string, body: { shuttlesUsed?: number; paid?: boolean }) =>
    http('PATCH', `/api/players/${playerId}`, body, key),
  addCourt: (sessionId: string, key: string, label?: string) =>
    http<{ courtId: string }>('POST', `/api/sessions/${sessionId}/courts`, { label }, key),
  patchCourt: (courtId: string, key: string, status: 'active' | 'closed') =>
    http('PATCH', `/api/courts/${courtId}`, { status }, key),
  startGame: (courtId: string, key: string, teamA: string[], teamB: string[]) =>
    http<{ gameId: string }>('POST', `/api/courts/${courtId}/games`, { teamA, teamB }, key),
  endGame: (gameId: string, key: string, shuttlesUsed: number, result?: 'A' | 'B' | 'draw' | null) =>
    http('POST', `/api/games/${gameId}/end`, { shuttlesUsed, result: result ?? null }, key),
  patchGameResult: (gameId: string, key: string, result: 'A' | 'B' | 'draw' | null) =>
    http('PATCH', `/api/games/${gameId}/result`, { result }, key),
  getGroupStats: (groupId: string) =>
    http<PlayerStat[]>('GET', `/api/groups/${groupId}/stats`),
  suggest: (sessionId: string, key: string, exclude?: string[]) =>
    http<Suggestion>(
      'GET',
      `/api/sessions/${sessionId}/suggest${exclude && exclude.length ? `?exclude=${exclude.join(',')}` : ''}`,
      undefined,
      key,
    ),
  aiSuggest: (sessionId: string, key: string, body: { count: number; prompt?: string; avoid?: AiMatch[] }) =>
    http<AiSuggestion>('POST', `/api/sessions/${sessionId}/ai-suggest`, body, key),
  addToMatchQueue: (sessionId: string, key: string, teamA: string[], teamB: string[]) =>
    http<{ matchQueueId: string }>('POST', `/api/sessions/${sessionId}/match-queue`, { teamA, teamB }, key),
  removeFromMatchQueue: (mqId: string, key: string) =>
    http('DELETE', `/api/match-queue/${mqId}`, undefined, key),
  startFromMatchQueue: (mqId: string, key: string, courtId: string) =>
    http<{ gameId: string }>('POST', `/api/match-queue/${mqId}/start`, { courtId }, key),
  listRoster: (groupId: string, key: string, q?: string) =>
    http<RosterPlayer[]>('GET', `/api/groups/${groupId}/roster${q ? `?q=${encodeURIComponent(q)}` : ''}`, undefined, key),
  addRoster: (groupId: string, key: string, name: string, skill: number) =>
    http<{ id: string }>('POST', `/api/groups/${groupId}/roster`, { name, skill }, key),
  patchRoster: (rosterId: string, key: string, body: { name?: string; skill?: number }) =>
    http('PATCH', `/api/roster/${rosterId}`, body, key),
  deleteRoster: (rosterId: string, key: string) =>
    http('DELETE', `/api/roster/${rosterId}`, undefined, key),
}

// ---- admin credentials in localStorage (losing the link = losing access) ----

const ADMIN_KEY = 'bm_admin'

export interface StoredAdmin {
  groupId: string
  key: string
}

export function loadAdmin(): StoredAdmin | null {
  try {
    const raw = localStorage.getItem(ADMIN_KEY)
    return raw ? (JSON.parse(raw) as StoredAdmin) : null
  } catch {
    return null
  }
}

export function saveAdmin(groupId: string, key: string) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify({ groupId, key }))
}

export function clearAdmin() {
  localStorage.removeItem(ADMIN_KEY)
}

export function adminUrl(groupId: string, key: string): string {
  return `${location.origin}/g/${groupId}/admin?key=${key}`
}
