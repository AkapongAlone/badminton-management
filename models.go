package main

// Config is the billing/session configuration. It lives on the Group as the
// default and is copied onto each Session at creation (editable per day).
type Config struct {
	BillingMode      string `json:"billingMode"` // "buffet" | "per_shuttle"
	CourtFee         int    `json:"courtFee"`
	ShuttlePrice     int    `json:"shuttlePrice"`
	BuffetPrice      int    `json:"buffetPrice"`
	CourtCostTotal   *int   `json:"courtCostTotal,omitempty"`
	ShuttleCost      *int   `json:"shuttleCost,omitempty"`
	WaitAlertMinutes int    `json:"waitAlertMinutes"`
}

func (c *Config) validate() string {
	if c.BillingMode != "buffet" && c.BillingMode != "per_shuttle" {
		return "billingMode must be \"buffet\" or \"per_shuttle\""
	}
	if c.CourtFee < 0 || c.ShuttlePrice < 0 || c.BuffetPrice < 0 {
		return "prices must be >= 0"
	}
	if c.CourtCostTotal != nil && *c.CourtCostTotal < 0 {
		return "courtCostTotal must be >= 0"
	}
	if c.ShuttleCost != nil && *c.ShuttleCost < 0 {
		return "shuttleCost must be >= 0"
	}
	if c.WaitAlertMinutes <= 0 {
		c.WaitAlertMinutes = 20
	}
	return ""
}

// sanitized returns a copy safe for the public board: organizer cost fields stripped.
func (c Config) sanitized() Config {
	c.CourtCostTotal = nil
	c.ShuttleCost = nil
	return c
}

// playerTotal computes what a player owes under this config.
func (c Config) playerTotal(shuttlesUsed int) int {
	if c.BillingMode == "buffet" {
		return c.BuffetPrice
	}
	return c.CourtFee + c.ShuttlePrice*shuttlesUsed
}

type RosterPlayer struct {
	ID         string `json:"id"`
	GroupID    string `json:"groupId"`
	Name       string `json:"name"`
	Skill      int    `json:"skill"`
	AvatarSeed string `json:"avatarSeed"`
}

type StatePlayer struct {
	ID             string `json:"id"`
	RosterPlayerID string `json:"rosterPlayerId"`
	Name           string `json:"name"`
	Skill          int    `json:"skill"`
	AvatarSeed     string `json:"avatarSeed"`
	Status         string `json:"status"` // waiting | playing | checked_out
	CheckedInAt    int64  `json:"checkedInAt"`
	WaitingSince   int64  `json:"waitingSince"`
	GamesPlayed    int    `json:"gamesPlayed"`
	ShuttlesUsed   int    `json:"shuttlesUsed"`
	Paid           bool   `json:"paid"`
	Total          int    `json:"total"`
	Note           string `json:"note"`
}

type MatchQueueItem struct {
	ID        string   `json:"id"`
	TeamA     []string `json:"teamA"`
	TeamB     []string `json:"teamB"`
	CreatedAt int64    `json:"createdAt"`
}

type StateGame struct {
	ID        string   `json:"id"`
	TeamA     []string `json:"teamA"`
	TeamB     []string `json:"teamB"`
	StartedAt int64    `json:"startedAt"`
}

type StateCourt struct {
	ID     string     `json:"id"`
	Label  string     `json:"label"`
	Status string     `json:"status"` // active | closed
	Game   *StateGame `json:"game,omitempty"`
}

type UnpaidEntry struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Total int    `json:"total"`
}

type Summary struct {
	PlayerCount      int           `json:"playerCount"`
	TotalGames       int           `json:"totalGames"`
	TotalShuttles    int           `json:"totalShuttles"` // shuttles actually opened (sum over games)
	RevenueCourt     int           `json:"revenueCourt"`
	RevenueShuttle   int           `json:"revenueShuttle"`
	RevenueTotal     int           `json:"revenueTotal"`
	Unpaid           []UnpaidEntry `json:"unpaid"`
	CourtCost        *int          `json:"courtCost,omitempty"`
	ShuttleCostTotal *int          `json:"shuttleCostTotal,omitempty"`
	Profit           *int          `json:"profit,omitempty"`
}

type StateSession struct {
	ID        string `json:"id"`
	GroupID   string `json:"groupId"`
	GroupName string `json:"groupName"`
	Date      string `json:"date"`
	Status    string `json:"status"` // open | closed
	Config    Config `json:"config"`
}

type StateResponse struct {
	Session    StateSession     `json:"session"`
	Courts     []StateCourt     `json:"courts"`
	Players    []StatePlayer    `json:"players"`
	MatchQueue []MatchQueueItem `json:"matchQueue"`
	Now        int64            `json:"now"`
	IsAdmin    bool             `json:"isAdmin"`
	Summary    *Summary         `json:"summary,omitempty"` // admin only
}
