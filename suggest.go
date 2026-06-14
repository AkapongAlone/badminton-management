package main

import (
	"encoding/json"
	"math"
	"sort"

	"github.com/gofiber/fiber/v2"
)

// Suggestion tuning. Wait time is the base currency; skill distance and prior
// meetings are expressed relative to it (roughly "how many minutes of extra
// waiting would I trade to avoid this").
const (
	skillStepMinutes  = 10.0 // 1 skill rank apart ≈ 10 minutes of waiting
	repeatPickMinutes = 12.0 // each prior meeting with the group ≈ 12 minutes
	splitRepeatWeight = 3.0  // repeat opponents weighed against skill imbalance in the team split
)

type suggestCand struct {
	ID           string
	Skill        int
	WaitingSince int64
}

// metFunc reports how many times two players have been on opposite teams.
type metFunc func(x, y string) int

// handleSuggest proposes 4 players + a team split for a free court.
//  1. Anchor = longest-waiting player.
//  2. Greedily add 3 more, each chosen for skill closeness to the anchor and
//     long wait, while avoiding players who've repeatedly met those already
//     picked (so the foursome is a fresh mix, not the same four again).
//  3. Split into the 2v2 partition that balances skill AND minimizes how often
//     the two sides have already faced each other.
//
// "Met" = having been on opposite teams in any game this session (the games
// table is the history). The suggestion is advisory only — assignment is
// always manual (no auto-assign).
func (s *Server) handleSuggest(c *fiber.Ctx) error {
	sr, ok := s.sessionAuth(c, c.Params("id"))
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}

	waiting, err := s.waitingCandidates(sr.ID)
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	if len(waiting) < 4 {
		return errJSON(c, 409, "ต้องมีผู้เล่นรออย่างน้อย 4 คน")
	}

	// Opponent history for this session: faced[x][y] = number of games in which
	// x and y were on opposite teams. Symmetric.
	faced, err := s.opponentHistory(sr.ID)
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	met := func(x, y string) int {
		if m := faced[x]; m != nil {
			return m[y]
		}
		return 0
	}

	sort.Slice(waiting, func(i, j int) bool { return waiting[i].WaitingSince < waiting[j].WaitingSince })
	picked := buildFoursome(waiting, met)
	teamA, teamB := bestSplit(picked, met)

	return c.JSON(fiber.Map{
		"players": []string{picked[0].ID, picked[1].ID, picked[2].ID, picked[3].ID},
		"teamA":   teamA,
		"teamB":   teamB,
	})
}

// waitingCandidates loads the session's waiting players with their skill.
func (s *Server) waitingCandidates(sessionID string) ([]suggestCand, error) {
	rows, err := s.db.Query(`
		SELECT sp.id, rp.skill, sp.waiting_since
		FROM session_players sp
		JOIN roster_players rp ON rp.id = sp.roster_player_id
		WHERE sp.session_id = ? AND sp.status = 'waiting'`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []suggestCand{}
	for rows.Next() {
		var p suggestCand
		if err := rows.Scan(&p.ID, &p.Skill, &p.WaitingSince); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

// buildFoursome takes wait-sorted candidates (longest waiting first) and greedily
// grows a group of 4 around the anchor, balancing skill closeness, wait time, and
// avoidance of repeat opponents within the group.
func buildFoursome(waiting []suggestCand, met metFunc) []suggestCand {
	now := nowMs()
	anchor := waiting[0]
	pool := append([]suggestCand{}, waiting[1:]...)
	picked := []suggestCand{anchor}
	for len(picked) < 4 {
		bestIdx, bestScore := 0, math.Inf(1)
		for i, p := range pool {
			skillDiff := math.Abs(float64(p.Skill - anchor.Skill))
			waitMin := float64(now-p.WaitingSince) / 60000.0
			repeats := 0
			for _, q := range picked {
				repeats += met(p.ID, q.ID)
			}
			score := skillDiff*skillStepMinutes - waitMin + float64(repeats)*repeatPickMinutes // lower is better
			if score < bestScore {
				bestScore, bestIdx = score, i
			}
		}
		picked = append(picked, pool[bestIdx])
		pool = append(pool[:bestIdx], pool[bestIdx+1:]...)
	}
	return picked
}

// bestSplit picks the 2v2 partition (anchor fixed on team A) that minimizes skill
// imbalance plus a penalty for repeat cross-team matchups.
func bestSplit(picked []suggestCand, met metFunc) (teamA, teamB []string) {
	bestCost := math.Inf(1)
	for i := 1; i <= 3; i++ {
		a := []suggestCand{picked[0], picked[i]}
		var b []suggestCand
		for j := 1; j <= 3; j++ {
			if j != i {
				b = append(b, picked[j])
			}
		}
		skillImbalance := math.Abs(float64(a[0].Skill + a[1].Skill - b[0].Skill - b[1].Skill))
		crossFaces := met(a[0].ID, b[0].ID) + met(a[0].ID, b[1].ID) + met(a[1].ID, b[0].ID) + met(a[1].ID, b[1].ID)
		cost := skillImbalance + float64(crossFaces)*splitRepeatWeight
		if cost < bestCost {
			bestCost = cost
			teamA = []string{a[0].ID, a[1].ID}
			teamB = []string{b[0].ID, b[1].ID}
		}
	}
	return teamA, teamB
}

// opponentHistory builds a symmetric map of how many games each pair of players
// has played against each other (opposite teams) in this session.
func (s *Server) opponentHistory(sessionID string) (map[string]map[string]int, error) {
	rows, err := s.db.Query(`SELECT team_a, team_b FROM games WHERE session_id = ?`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	faced := map[string]map[string]int{}
	bump := func(x, y string) {
		if faced[x] == nil {
			faced[x] = map[string]int{}
		}
		faced[x][y]++
	}
	for rows.Next() {
		var taJSON, tbJSON string
		if err := rows.Scan(&taJSON, &tbJSON); err != nil {
			return nil, err
		}
		var a, b []string
		json.Unmarshal([]byte(taJSON), &a)
		json.Unmarshal([]byte(tbJSON), &b)
		for _, x := range a {
			for _, y := range b {
				bump(x, y)
				bump(y, x)
			}
		}
	}
	return faced, nil
}
