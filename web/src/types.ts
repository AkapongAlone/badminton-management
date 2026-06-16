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

export interface HistoryGame {
  id: string
  courtLabel: string
  teamA: string[]
  teamB: string[]
  startedAt: number
  endedAt: number
  shuttlesUsed: number
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
  history: HistoryGame[]
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

export interface AiMatch {
  teamA: string[]
  teamB: string[]
}

export interface AiSuggestion {
  matches: AiMatch[]
  note?: string
}

// Skill is a 1-4 ladder from weakest (1) to strongest (4). Index = skill - 1.
export const SKILL_MIN = 1
export const SKILL_MAX = 4
export const SKILL_LABELS = ['1', '2', '3', '4']

export function skillLabel(skill: number): string {
  return SKILL_LABELS[skill - 1] ?? `${skill}`
}

// One distinct, saturated colour per level — filled badges with white text so they
// stay legible on both the light admin pages and the dark public board (never blend
// into the background). Index = skill - 1.
const SKILL_CLASSES = [
  'bg-emerald-500 text-white', // 1
  'bg-sky-500 text-white',     // 2
  'bg-orange-500 text-white',  // 3
  'bg-rose-600 text-white',    // 4
]

export function skillClass(skill: number): string {
  return SKILL_CLASSES[skill - 1] ?? 'bg-gray-500 text-white'
}
