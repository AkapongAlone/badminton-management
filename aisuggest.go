package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/gofiber/fiber/v2"
)

// aiSuggestSystem instructs Claude to act as the session organizer. The model
// only ever sees player *numbers* (1-based into the list we send), never the
// internal IDs — we map numbers back to session_player IDs server-side, so a
// hallucinated ID can't slip through.
const aiSuggestSystem = `You are an experienced badminton session organizer arranging doubles (2v2) matches.
You are given a list of players currently waiting. Each has a skill rating (1-7, higher = stronger),
how many games they have already played today, and how many minutes they have been waiting.

A match has two sides: teamA and teamB. The two players inside teamA are PARTNERS playing on the
SAME side; the two in teamB are their OPPONENTS on the other side. So teamA = [X, Y] means X and Y
play together as a pair AGAINST the teamB pair.

Arrange up to the requested number of balanced 2v2 matches. Follow these DEFAULT principles only
when the organizer hasn't said otherwise:
- Prioritize players who have waited the longest and played the fewest games.
- Within each match, split the four players so the two teams are as even in skill as possible.
- Avoid making partners (or repeatedly opposing) people who have already played together a lot.
- By default each player appears in at most one match.

The organizer's extra instructions (if any) are ABSOLUTE and OVERRIDE every default principle above,
including skill balance, waiting priority, and the one-match-per-player rule. Satisfy them EXACTLY,
even if it produces lopsided or repetitive matches — the organizer's wishes always win. The four
players WITHIN a single match must still be four different people (no one on both teams or twice on
the same team), but the SAME player MAY appear in multiple matches when the instruction calls for it.

How to read the organizer's instructions (they are written in Thai):
- "ให้ X คู่กับ Y" / "X จับคู่กับ Y" / "X เป็นคู่กับ Y" / "X partner with Y" means X and Y are
  PARTNERS: put BOTH of them on the SAME side of one match — i.e. teamA = [X, Y] (or teamB = [X, Y]).
  This is the most common request and you MUST NOT put them on opposite sides.
- "อย่าให้ X คู่กับ Y" / "ห้าม X คู่ Y" means X and Y must NOT be partners (they may be opponents,
  or in different matches, or one may sit out).
- "X เจอกับ Y" / "X เล่นกับ Y" / "X ปะทะ Y" means they are OPPONENTS: X in teamA, Y in teamB (or vice versa).
- Identify players by their number. Two players may share the same display name — they are
  DIFFERENT people, so never treat them as interchangeable.
- If an instruction names a player and several waiting players share that name, apply it to each
  of those players where possible.
- The words "ตลอด" / "ทุกคู่" / "ทุกเกม" / "every match" mean the instruction applies to EVERY
  match you generate, not just one. So "ให้ X คู่กับ Y ตลอด" with 3 matches requested means X and Y
  must be partners (same side) in ALL 3 matches — repeat them in every match, and fill the opposing
  side with other players. Reusing X and Y across matches here is REQUIRED, not a mistake.
- If a constraint genuinely cannot be satisfied (e.g. there aren't enough other players to fill the
  opponents), produce as many matches as you can and explain briefly in the Thai note why.

Respond with ONLY a JSON object — no markdown fences, no text outside the JSON — in exactly this shape:
{"matches":[{"teamA":[<playerNumber>,<playerNumber>],"teamB":[<playerNumber>,<playerNumber>]}],"note":"<one short sentence in Thai explaining the idea>"}
Use the player numbers from the list. Provide at most the requested number of matches.
Example: organizer says "ให้ 3 คู่กับ 7 ตลอด" and asks for 2 matches → return 2 matches, each with
teamA = [3, 7] (or teamB = [3, 7]) and two different opponents in the other slot of each match.`

// handleAISuggest asks Claude to propose one or more 2v2 matches from the waiting
// players, optionally guided by a free-text prompt from the organizer. The result
// is advisory — the organizer reviews and adds matches to the queue manually.
func (s *Server) handleAISuggest(c *fiber.Ctx) error {
	sr, ok := s.sessionAuth(c, c.Params("id"))
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}

	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return errJSON(c, 503, "ยังไม่ได้เปิดใช้ AI — ต้องตั้งค่า ANTHROPIC_API_KEY ที่เซิร์ฟเวอร์ก่อน")
	}

	var body struct {
		Prompt string `json:"prompt"`
		Count  int    `json:"count"`
		// Avoid carries pairings from earlier suggestions this round ("ขอใหม่อีกครั้ง")
		// so we can nudge the model toward a fresh arrangement. Player IDs.
		Avoid []struct {
			TeamA []string `json:"teamA"`
			TeamB []string `json:"teamB"`
		} `json:"avoid"`
	}
	c.BodyParser(&body)
	count := body.Count
	if count < 1 {
		count = 1
	}

	players, err := s.aiWaitingPlayers(sr.ID)
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	if len(players) < 4 {
		return errJSON(c, 409, "ต้องมีผู้เล่นรออย่างน้อย 4 คน")
	}
	if maxMatches := len(players) / 4; count > maxMatches {
		count = maxMatches
	}

	faced, err := s.opponentHistory(sr.ID)
	if err != nil {
		return errJSON(c, 500, err.Error())
	}

	// Players are referenced by name in the organizer's free-text instructions, but
	// names aren't unique (two "Aek"s). Build a unique label per player so the model
	// can't conflate same-named people — duplicates get a "(คนที่ N)" suffix.
	nameTotal := map[string]int{}
	for _, p := range players {
		nameTotal[p.Name]++
	}
	nameSeen := map[string]int{}
	labels := make([]string, len(players))
	for i, p := range players {
		if nameTotal[p.Name] > 1 {
			nameSeen[p.Name]++
			labels[i] = fmt.Sprintf("%s (คนที่ %d)", p.Name, nameSeen[p.Name])
		} else {
			labels[i] = p.Name
		}
	}

	// Build the player roster + prior-matchup context for the model.
	now := nowMs()
	var sb strings.Builder
	fmt.Fprintf(&sb, "จัดคู่ให้ %d คู่ จากผู้เล่นที่กำลังรอด้านล่างนี้:\n\n", count)
	for i, p := range players {
		waitMin := (now - p.WaitingSince) / 60000
		fmt.Fprintf(&sb, "%d. %s — skill %d, เล่นไปแล้ว %d เกม, รอมา %d นาที\n",
			i+1, labels[i], p.Skill, p.GamesPlayed, waitMin)
	}
	metLines := []string{}
	for i := 0; i < len(players); i++ {
		for j := i + 1; j < len(players); j++ {
			if n := faced[players[i].ID][players[j].ID]; n > 0 {
				metLines = append(metLines, fmt.Sprintf("- %s กับ %s เคยอยู่คนละทีมกันมาแล้ว %d ครั้ง",
					labels[i], labels[j], n))
			}
		}
	}
	if len(metLines) > 0 {
		sb.WriteString("\nคู่ที่เคยเจอกันแล้ว (พยายามเลี่ยงให้ซ้ำน้อยที่สุด):\n")
		sb.WriteString(strings.Join(metLines, "\n"))
		sb.WriteString("\n")
	}

	// "ขอใหม่อีกครั้ง" passes the earlier suggestions back so we can ask for a
	// different arrangement — but only as a soft preference, never at the expense of
	// the organizer's explicit instructions below.
	labelByID := make(map[string]string, len(players))
	for i, p := range players {
		labelByID[p.ID] = labels[i]
	}
	sideNames := func(ids []string) string {
		parts := []string{}
		for _, id := range ids {
			if lbl, ok := labelByID[id]; ok {
				parts = append(parts, lbl)
			}
		}
		return strings.Join(parts, " + ")
	}
	avoidLines := []string{}
	for _, m := range body.Avoid {
		a, b := sideNames(m.TeamA), sideNames(m.TeamB)
		if a != "" && b != "" {
			avoidLines = append(avoidLines, fmt.Sprintf("- %s ปะทะ %s", a, b))
		}
	}
	if len(avoidLines) > 0 {
		sb.WriteString("\nรอบก่อนเพิ่งเสนอคู่พวกนี้ไปแล้ว พยายามจัดให้ต่างออกไป (สลับคู่หูหรือคู่ต่อสู้) เท่าที่ทำได้ โดยไม่ขัดกับคำสั่งของหัวหน้าก๊วนด้านล่าง:\n")
		sb.WriteString(strings.Join(avoidLines, "\n"))
		sb.WriteString("\n")
	}

	if extra := strings.TrimSpace(body.Prompt); extra != "" {
		fmt.Fprintf(&sb, "\nคำสั่งเพิ่มเติมจากหัวหน้าก๊วน (ให้ความสำคัญเป็นพิเศษ): %s\n", extra)
	}

	// Haiku 4.5 is fast and cheap, which fits this lightweight matchmaking task.
	// Override with AI_MODEL (e.g. claude-sonnet-4-6) if you want a stronger model.
	model := env("AI_MODEL", string(anthropic.ModelClaudeHaiku4_5_20251001))
	client := anthropic.NewClient(option.WithAPIKey(apiKey))
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	msg, err := client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(model),
		MaxTokens: 2000,
		System:    []anthropic.TextBlockParam{{Text: aiSuggestSystem}},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(sb.String())),
		},
	})
	if err != nil {
		return errJSON(c, 502, "เรียก AI ไม่สำเร็จ: "+err.Error())
	}

	var raw strings.Builder
	for _, block := range msg.Content {
		if t, ok := block.AsAny().(anthropic.TextBlock); ok {
			raw.WriteString(t.Text)
		}
	}

	var parsed struct {
		Matches []struct {
			TeamA []int `json:"teamA"`
			TeamB []int `json:"teamB"`
		} `json:"matches"`
		Note string `json:"note"`
	}
	if err := json.Unmarshal([]byte(extractJSONObject(raw.String())), &parsed); err != nil {
		return errJSON(c, 502, "AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ ลองใหม่อีกครั้ง")
	}

	// Map player numbers back to IDs, dropping anything malformed: each match must be
	// 2v2 with four DISTINCT players within that match. We intentionally do NOT enforce
	// uniqueness ACROSS matches — the organizer may instruct the same pair to play every
	// match (e.g. "Aek คู่กับ Cherry ตลอด"), and their wishes take priority over the
	// default "one match per player". The queue already supports a player in several
	// pending matches, and starting one checks the players are free.
	matches := []fiber.Map{}
	toIDs := func(idxs []int) []string {
		r := make([]string, 0, len(idxs))
		for _, idx := range idxs {
			r = append(r, players[idx-1].ID)
		}
		return r
	}
	for _, m := range parsed.Matches {
		if len(m.TeamA) != 2 || len(m.TeamB) != 2 {
			continue
		}
		all := append(append([]int{}, m.TeamA...), m.TeamB...)
		seen := map[int]bool{}
		valid := true
		for _, idx := range all {
			if idx < 1 || idx > len(players) || seen[idx] {
				valid = false
				break
			}
			seen[idx] = true
		}
		if !valid {
			continue
		}
		matches = append(matches, fiber.Map{"teamA": toIDs(m.TeamA), "teamB": toIDs(m.TeamB)})
	}
	if len(matches) == 0 {
		return errJSON(c, 502, "AI ยังจัดคู่ที่ใช้ได้ไม่ได้ ลองกดใหม่อีกครั้ง")
	}
	return c.JSON(fiber.Map{"matches": matches, "note": parsed.Note})
}

type aiPlayer struct {
	ID           string
	Name         string
	Skill        int
	GamesPlayed  int
	WaitingSince int64
}

// aiWaitingPlayers loads the session's waiting players (longest-waiting first)
// with the fields the model reasons over.
func (s *Server) aiWaitingPlayers(sessionID string) ([]aiPlayer, error) {
	rows, err := s.db.Query(`
		SELECT sp.id, rp.name, rp.skill, sp.games_played, sp.waiting_since
		FROM session_players sp
		JOIN roster_players rp ON rp.id = sp.roster_player_id
		WHERE sp.session_id = ? AND sp.status = 'waiting'
		ORDER BY sp.waiting_since`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []aiPlayer{}
	for rows.Next() {
		var p aiPlayer
		if err := rows.Scan(&p.ID, &p.Name, &p.Skill, &p.GamesPlayed, &p.WaitingSince); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

// extractJSONObject pulls the outermost {...} out of a model reply, tolerating
// stray prose or ```json fences around it.
func extractJSONObject(s string) string {
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}
