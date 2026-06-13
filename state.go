package main

import (
	"database/sql"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
)

// handleState returns the full session state. Public callers (no/invalid token)
// get a sanitized payload: cost config fields stripped, no summary.
// Invariant 4: sanitization happens server-side, never in the frontend.
func (s *Server) handleState(c *fiber.Ctx) error {
	sessionID := c.Params("id")
	sr, err := s.getSession(sessionID)
	if err == sql.ErrNoRows {
		return errJSON(c, 404, "session not found")
	}
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	var groupName, adminToken string
	if err := s.db.QueryRow(`SELECT name, admin_token FROM groups WHERE id = ?`, sr.GroupID).
		Scan(&groupName, &adminToken); err != nil {
		return errJSON(c, 500, err.Error())
	}
	isAdmin := reqToken(c) != "" && reqToken(c) == adminToken

	// Players
	rows, err := s.db.Query(`
		SELECT sp.id, sp.roster_player_id, rp.name, rp.skill, rp.avatar_seed,
		       sp.status, sp.checked_in_at, sp.waiting_since, sp.games_played, sp.shuttles_used, sp.paid, sp.note
		FROM session_players sp
		JOIN roster_players rp ON rp.id = sp.roster_player_id
		WHERE sp.session_id = ?
		ORDER BY sp.checked_in_at`, sessionID)
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	defer rows.Close()
	players := []StatePlayer{}
	for rows.Next() {
		var p StatePlayer
		var paid int
		if err := rows.Scan(&p.ID, &p.RosterPlayerID, &p.Name, &p.Skill, &p.AvatarSeed,
			&p.Status, &p.CheckedInAt, &p.WaitingSince, &p.GamesPlayed, &p.ShuttlesUsed, &paid, &p.Note); err != nil {
			return errJSON(c, 500, err.Error())
		}
		p.Paid = paid == 1
		p.Total = sr.Config.playerTotal(p.ShuttlesUsed)
		players = append(players, p)
	}

	// Courts + active games
	courts := []StateCourt{}
	crows, err := s.db.Query(`SELECT id, label, status FROM courts WHERE session_id = ? ORDER BY created_at`, sessionID)
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	defer crows.Close()
	for crows.Next() {
		var ct StateCourt
		if err := crows.Scan(&ct.ID, &ct.Label, &ct.Status); err != nil {
			return errJSON(c, 500, err.Error())
		}
		courts = append(courts, ct)
	}
	grows, err := s.db.Query(`SELECT id, court_id, team_a, team_b, started_at FROM games WHERE session_id = ? AND ended_at IS NULL`, sessionID)
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	defer grows.Close()
	gamesByCourt := map[string]*StateGame{}
	for grows.Next() {
		var g StateGame
		var courtID, teamA, teamB string
		if err := grows.Scan(&g.ID, &courtID, &teamA, &teamB, &g.StartedAt); err != nil {
			return errJSON(c, 500, err.Error())
		}
		json.Unmarshal([]byte(teamA), &g.TeamA)
		json.Unmarshal([]byte(teamB), &g.TeamB)
		gamesByCourt[courtID] = &g
	}
	for i := range courts {
		courts[i].Game = gamesByCourt[courts[i].ID]
	}

	// Match queue (admin only — public board doesn't need it)
	matchQueue := []MatchQueueItem{}
	if isAdmin {
		mqRows, err := s.db.Query(`SELECT id, team_a, team_b, created_at FROM match_queue WHERE session_id = ? ORDER BY created_at`, sessionID)
		if err != nil {
			return errJSON(c, 500, err.Error())
		}
		defer mqRows.Close()
		for mqRows.Next() {
			var mq MatchQueueItem
			var ta, tb string
			if err := mqRows.Scan(&mq.ID, &ta, &tb, &mq.CreatedAt); err != nil {
				return errJSON(c, 500, err.Error())
			}
			json.Unmarshal([]byte(ta), &mq.TeamA)
			json.Unmarshal([]byte(tb), &mq.TeamB)
			matchQueue = append(matchQueue, mq)
		}
	}

	cfg := sr.Config
	if !isAdmin {
		cfg = cfg.sanitized()
	}
	resp := StateResponse{
		Session: StateSession{
			ID: sr.ID, GroupID: sr.GroupID, GroupName: groupName,
			Date: sr.Date, Status: sr.Status, Config: cfg,
		},
		Courts:     courts,
		Players:    players,
		MatchQueue: matchQueue,
		Now:        nowMs(),
		IsAdmin:    isAdmin,
	}
	if isAdmin {
		sum, err := s.buildSummary(sr, players)
		if err != nil {
			return errJSON(c, 500, err.Error())
		}
		resp.Summary = sum
	}
	return c.JSON(resp)
}

func (s *Server) buildSummary(sr *sessionRow, players []StatePlayer) (*Summary, error) {
	sum := &Summary{Unpaid: []UnpaidEntry{}}
	sum.PlayerCount = len(players)

	// Shuttles actually opened = sum over games (cost side). Revenue uses the
	// per-player cumulative counts, which the organizer may have hand-corrected.
	var totalGames, gameShuttles int
	if err := s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(shuttles_used), 0) FROM games WHERE session_id = ?`, sr.ID).
		Scan(&totalGames, &gameShuttles); err != nil {
		return nil, err
	}
	sum.TotalGames = totalGames
	sum.TotalShuttles = gameShuttles

	cfg := sr.Config
	for _, p := range players {
		if cfg.BillingMode == "buffet" {
			sum.RevenueCourt += cfg.BuffetPrice
		} else {
			sum.RevenueCourt += cfg.CourtFee
			sum.RevenueShuttle += cfg.ShuttlePrice * p.ShuttlesUsed
		}
		if !p.Paid {
			sum.Unpaid = append(sum.Unpaid, UnpaidEntry{ID: p.ID, Name: p.Name, Total: p.Total})
		}
	}
	sum.RevenueTotal = sum.RevenueCourt + sum.RevenueShuttle

	if cfg.CourtCostTotal != nil || cfg.ShuttleCost != nil {
		courtCost := 0
		if cfg.CourtCostTotal != nil {
			courtCost = *cfg.CourtCostTotal
		}
		shuttleCostTotal := 0
		if cfg.ShuttleCost != nil {
			shuttleCostTotal = *cfg.ShuttleCost * gameShuttles
		}
		profit := sum.RevenueTotal - courtCost - shuttleCostTotal
		sum.CourtCost = &courtCost
		sum.ShuttleCostTotal = &shuttleCostTotal
		sum.Profit = &profit
	}
	return sum, nil
}
