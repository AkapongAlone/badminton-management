package main

import (
	"math"
	"sort"

	"github.com/gofiber/fiber/v2"
)

// handleSuggest proposes 4 players + a team split for a free court.
// 1. Anchor = longest-waiting player.
// 2. Fill 3 more by skill closeness to the anchor, weighted by wait time
//    (1 skill step ≈ 10 minutes of waiting).
// 3. Split into the 2v2 partition minimizing the skill-sum difference.
// The suggestion is advisory only — assignment is always manual (no auto-assign).
func (s *Server) handleSuggest(c *fiber.Ctx) error {
	sr, ok := s.sessionAuth(c, c.Params("id"))
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}

	type cand struct {
		ID           string
		Skill        int
		WaitingSince int64
	}
	rows, err := s.db.Query(`
		SELECT sp.id, rp.skill, sp.waiting_since
		FROM session_players sp
		JOIN roster_players rp ON rp.id = sp.roster_player_id
		WHERE sp.session_id = ? AND sp.status = 'waiting'`, sr.ID)
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	defer rows.Close()
	waiting := []cand{}
	for rows.Next() {
		var p cand
		if err := rows.Scan(&p.ID, &p.Skill, &p.WaitingSince); err != nil {
			return errJSON(c, 500, err.Error())
		}
		waiting = append(waiting, p)
	}
	if len(waiting) < 4 {
		return errJSON(c, 409, "ต้องมีผู้เล่นรออย่างน้อย 4 คน")
	}

	now := nowMs()
	sort.Slice(waiting, func(i, j int) bool { return waiting[i].WaitingSince < waiting[j].WaitingSince })
	anchor := waiting[0]
	rest := waiting[1:]

	score := func(p cand) float64 {
		skillDiff := math.Abs(float64(p.Skill - anchor.Skill))
		waitMin := float64(now-p.WaitingSince) / 60000.0
		return skillDiff*10 - waitMin // lower is better
	}
	sort.Slice(rest, func(i, j int) bool { return score(rest[i]) < score(rest[j]) })
	picked := append([]cand{anchor}, rest[:3]...)

	// Best 2v2 split: anchor stays on team A; try the 3 possible partners.
	bestDiff := math.MaxInt32 + 1.0
	var teamA, teamB []string
	for i := 1; i <= 3; i++ {
		a := []cand{picked[0], picked[i]}
		var b []cand
		for j := 1; j <= 3; j++ {
			if j != i {
				b = append(b, picked[j])
			}
		}
		diff := math.Abs(float64(a[0].Skill + a[1].Skill - b[0].Skill - b[1].Skill))
		if diff < bestDiff {
			bestDiff = diff
			teamA = []string{a[0].ID, a[1].ID}
			teamB = []string{b[0].ID, b[1].ID}
		}
	}

	return c.JSON(fiber.Map{
		"players": []string{picked[0].ID, picked[1].ID, picked[2].ID, picked[3].ID},
		"teamA":   teamA,
		"teamB":   teamB,
	})
}
