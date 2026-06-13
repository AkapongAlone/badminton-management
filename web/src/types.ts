export interface Config {
  billingMode: 'buffet' | 'per_shuttle'
  courtFee: number
  shuttlePrice: number
  buffetPrice: number
  courtCostTotal?: number | null
  shuttleCost?: number | null
  waitAlertMinutes: number
}

export interface RosterPlayer {
  id: string
  groupId: string
  name: string
  skill: number
  avatarSeed: string
}

export interface StatePlayer {
  id: string
  rosterPlayerId: string
  name: string
  skill: number
  avatarSeed: string
  status: 'waiting' | 'playing' | 'checked_out'
  checkedInAt: number
  waitingSince: number
  gamesPlayed: number
  shuttlesUsed: number
  paid: boolean
  total: number
  note: string
}

export interface MatchQueueItem {
  id: string
  teamA: string[]
  teamB: string[]
  createdAt: number
}

export interface StateGame {
  id: string
  teamA: string[]
  teamB: string[]
  startedAt: number
}

export interface StateCourt {
  id: string
  label: string
  status: 'active' | 'closed'
  game?: StateGame
}

export interface UnpaidEntry {
  id: string
  name: string
  total: number
}

export interface Summary {
  playerCount: number
  totalGames: number
  totalShuttles: number
  revenueCourt: number
  revenueShuttle: number
  revenueTotal: number
  unpaid: UnpaidEntry[]
  courtCost?: number
  shuttleCostTotal?: number
  profit?: number
}

export interface SessionState {
  session: {
    id: string
    groupId: string
    groupName: string
    date: string
    status: 'open' | 'closed'
    config: Config
  }
  courts: StateCourt[]
  players: StatePlayer[]
  matchQueue: MatchQueueItem[]
  now: number
  isAdmin: boolean
  summary?: Summary
}

export interface GroupInfo {
  id: string
  name: string
  config: Config
  currentSession: { id: string; date: string; status: 'open' | 'closed' } | null
}

export interface Suggestion {
  players: string[]
  teamA: string[]
  teamB: string[]
}

// Thai casual skill ranks, index = skill - 1
export const SKILL_LABELS = ['มือหน้าบ้าน', 'N', 'NB', 'BG', 'B', 'C', 'C+ขึ้นไป']

export function skillLabel(skill: number): string {
  return SKILL_LABELS[skill - 1] ?? `${skill}`
}
