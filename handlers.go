package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type Server struct {
	db *sql.DB
}

func errJSON(c *fiber.Ctx, code int, msg string) error {
	return c.Status(code).JSON(fiber.Map{"error": msg})
}

// reqToken extracts the admin token from query param or header.
func reqToken(c *fiber.Ctx) string {
	if k := c.Query("key"); k != "" {
		return k
	}
	return c.Get("X-Admin-Token")
}

// groupAuth verifies the request token against the group's admin token.
func (s *Server) groupAuth(c *fiber.Ctx, groupID string) (bool, error) {
	var token string
	err := s.db.QueryRow(`SELECT admin_token FROM groups WHERE id = ?`, groupID).Scan(&token)
	if err == sql.ErrNoRows {
		return false, errJSON(c, 404, "group not found")
	}
	if err != nil {
		return false, errJSON(c, 500, err.Error())
	}
	if reqToken(c) != token {
		return false, errJSON(c, 401, "invalid admin token")
	}
	return true, nil
}

type sessionRow struct {
	ID      string
	GroupID string
	Date    string
	Status  string
	Config  Config
}

func (s *Server) getSession(id string) (*sessionRow, error) {
	var sr sessionRow
	var cfgJSON string
	err := s.db.QueryRow(`SELECT id, group_id, date, status, config FROM sessions WHERE id = ?`, id).
		Scan(&sr.ID, &sr.GroupID, &sr.Date, &sr.Status, &cfgJSON)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(cfgJSON), &sr.Config); err != nil {
		return nil, err
	}
	return &sr, nil
}

// sessionAuth loads a session and verifies admin access to its group.
func (s *Server) sessionAuth(c *fiber.Ctx, sessionID string) (*sessionRow, bool) {
	sr, err := s.getSession(sessionID)
	if err == sql.ErrNoRows {
		errJSON(c, 404, "session not found")
		return nil, false
	}
	if err != nil {
		errJSON(c, 500, err.Error())
		return nil, false
	}
	if ok, _ := s.groupAuth(c, sr.GroupID); !ok {
		return nil, false
	}
	return sr, true
}

// ---------- Groups ----------

func (s *Server) createGroup(c *fiber.Ctx) error {
	var body struct {
		Name   string `json:"name"`
		Config Config `json:"config"`
	}
	if err := c.BodyParser(&body); err != nil {
		return errJSON(c, 400, "invalid body")
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		return errJSON(c, 400, "name is required")
	}
	if msg := body.Config.validate(); msg != "" {
		return errJSON(c, 400, msg)
	}
	id, token := newID(), newToken()
	cfgJSON, _ := json.Marshal(body.Config)
	if _, err := s.db.Exec(`INSERT INTO groups (id, name, admin_token, config) VALUES (?,?,?,?)`,
		id, body.Name, token, string(cfgJSON)); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{
		"groupId":    id,
		"adminToken": token,
		"adminUrl":   fmt.Sprintf("/g/%s/admin?key=%s", id, token),
	})
}

func (s *Server) getGroup(c *fiber.Ctx) error {
	groupID := c.Params("id")
	if ok, err := s.groupAuth(c, groupID); !ok {
		return err
	}
	var name, cfgJSON string
	if err := s.db.QueryRow(`SELECT name, config FROM groups WHERE id = ?`, groupID).Scan(&name, &cfgJSON); err != nil {
		return errJSON(c, 500, err.Error())
	}
	var cfg Config
	json.Unmarshal([]byte(cfgJSON), &cfg)

	// Current session: an open one if it exists, otherwise the most recent.
	var sess fiber.Map
	var sid, sdate, sstatus string
	err := s.db.QueryRow(
		`SELECT id, date, status FROM sessions WHERE group_id = ?
		 ORDER BY (status = 'open') DESC, created_at DESC LIMIT 1`, groupID).
		Scan(&sid, &sdate, &sstatus)
	if err == nil {
		sess = fiber.Map{"id": sid, "date": sdate, "status": sstatus}
	} else if err != sql.ErrNoRows {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"id": groupID, "name": name, "config": cfg, "currentSession": sess})
}

// ---------- Sessions ----------

func (s *Server) createSession(c *fiber.Ctx) error {
	groupID := c.Params("id")
	if ok, err := s.groupAuth(c, groupID); !ok {
		return err
	}
	var body struct {
		Config Config `json:"config"`
		Courts int    `json:"courts"`
	}
	if err := c.BodyParser(&body); err != nil {
		return errJSON(c, 400, "invalid body")
	}
	if msg := body.Config.validate(); msg != "" {
		return errJSON(c, 400, msg)
	}
	if body.Courts < 1 || body.Courts > 20 {
		return errJSON(c, 400, "courts must be 1-20")
	}
	var openCount int
	s.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE group_id = ? AND status = 'open'`, groupID).Scan(&openCount)
	if openCount > 0 {
		return errJSON(c, 409, "มีก๊วนที่ยังเปิดอยู่ ต้องปิดก๊วนก่อนเปิดใหม่")
	}
	id := newID()
	cfgJSON, _ := json.Marshal(body.Config)
	now := nowMs()
	tx, err := s.db.Begin()
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO sessions (id, group_id, date, status, config, created_at) VALUES (?,?,?,'open',?,?)`,
		id, groupID, todayBangkok(), string(cfgJSON), now); err != nil {
		return errJSON(c, 500, err.Error())
	}
	for i := 1; i <= body.Courts; i++ {
		if _, err := tx.Exec(`INSERT INTO courts (id, session_id, label, status, created_at) VALUES (?,?,?,'active',?)`,
			newID(), id, fmt.Sprintf("คอร์ท %d", i), now+int64(i)); err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	if err := tx.Commit(); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"sessionId": id})
}

func (s *Server) patchSessionConfig(c *fiber.Ctx) error {
	sr, ok := s.sessionAuth(c, c.Params("id"))
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	var cfg Config
	if err := c.BodyParser(&cfg); err != nil {
		return errJSON(c, 400, "invalid body")
	}
	if msg := cfg.validate(); msg != "" {
		return errJSON(c, 400, msg)
	}
	cfgJSON, _ := json.Marshal(cfg)
	if _, err := s.db.Exec(`UPDATE sessions SET config = ? WHERE id = ?`, string(cfgJSON), sr.ID); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (s *Server) closeSession(c *fiber.Ctx) error {
	sr, ok := s.sessionAuth(c, c.Params("id"))
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session already closed")
	}
	var active int
	s.db.QueryRow(`SELECT COUNT(*) FROM games WHERE session_id = ? AND ended_at IS NULL`, sr.ID).Scan(&active)
	if active > 0 {
		return errJSON(c, 409, "ยังมีเกมค้างอยู่ในคอร์ท ต้องจบเกมทั้งหมดก่อนปิดก๊วน")
	}
	if _, err := s.db.Exec(`UPDATE sessions SET status = 'closed' WHERE id = ?`, sr.ID); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// payAllPlayers marks every player in the session as paid in one tap — handy after
// closing the group once everyone has settled up. The paid flag stays editable
// after close (invariant 5), so this works whether the session is open or closed.
func (s *Server) payAllPlayers(c *fiber.Ctx) error {
	sr, ok := s.sessionAuth(c, c.Params("id"))
	if !ok {
		return nil
	}
	if _, err := s.db.Exec(`UPDATE session_players SET paid = 1 WHERE session_id = ?`, sr.ID); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ---------- Players (check-in / checkout / patch) ----------

func (s *Server) checkIn(c *fiber.Ctx) error {
	sr, ok := s.sessionAuth(c, c.Params("id"))
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	var body struct {
		RosterPlayerID string `json:"rosterPlayerId"`
		Name           string `json:"name"`
		Skill          int    `json:"skill"`
		Note           string `json:"note"`
	}
	if err := c.BodyParser(&body); err != nil {
		return errJSON(c, 400, "invalid body")
	}
	rosterID := body.RosterPlayerID
	if rosterID == "" {
		// Create a new roster entry, then check in.
		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" {
			return errJSON(c, 400, "name is required")
		}
		if body.Skill < 1 || body.Skill > 4 {
			return errJSON(c, 400, "skill must be 1-4")
		}
		rosterID = newID()
		if _, err := s.db.Exec(`INSERT INTO roster_players (id, group_id, name, skill, avatar_seed) VALUES (?,?,?,?,?)`,
			rosterID, sr.GroupID, body.Name, body.Skill, body.Name+"-"+rosterID[:4]); err != nil {
			return errJSON(c, 500, err.Error())
		}
	} else {
		var gid string
		err := s.db.QueryRow(`SELECT group_id FROM roster_players WHERE id = ?`, rosterID).Scan(&gid)
		if err == sql.ErrNoRows || (err == nil && gid != sr.GroupID) {
			return errJSON(c, 404, "roster player not found")
		}
		if err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	now := nowMs()
	id := newID()
	_, err := s.db.Exec(`INSERT INTO session_players (id, session_id, roster_player_id, status, checked_in_at, waiting_since, note)
		VALUES (?,?,?,'waiting',?,?,?)`, id, sr.ID, rosterID, now, now, strings.TrimSpace(body.Note))
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return errJSON(c, 409, "ผู้เล่นคนนี้เช็คอินวันนี้แล้ว")
		}
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"sessionPlayerId": id, "rosterPlayerId": rosterID})
}

// playerAuth loads a session player + its session and verifies admin access.
func (s *Server) playerAuth(c *fiber.Ctx, playerID string) (sessionID, status string, sr *sessionRow, ok bool) {
	err := s.db.QueryRow(`SELECT session_id, status FROM session_players WHERE id = ?`, playerID).Scan(&sessionID, &status)
	if err == sql.ErrNoRows {
		errJSON(c, 404, "player not found")
		return "", "", nil, false
	}
	if err != nil {
		errJSON(c, 500, err.Error())
		return "", "", nil, false
	}
	sr, ok = s.sessionAuth(c, sessionID)
	return sessionID, status, sr, ok
}

func (s *Server) checkoutPlayer(c *fiber.Ctx) error {
	id := c.Params("id")
	_, status, sr, ok := s.playerAuth(c, id)
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	if status == "playing" {
		return errJSON(c, 409, "ผู้เล่นกำลังเล่นอยู่ ต้องจบเกมก่อนเช็คเอาท์")
	}
	if status == "checked_out" {
		return errJSON(c, 409, "player already checked out")
	}
	if _, err := s.db.Exec(`UPDATE session_players SET status = 'checked_out' WHERE id = ?`, id); err != nil {
		return errJSON(c, 500, err.Error())
	}
	var shuttles int
	s.db.QueryRow(`SELECT shuttles_used FROM session_players WHERE id = ?`, id).Scan(&shuttles)
	return c.JSON(fiber.Map{"ok": true, "total": sr.Config.playerTotal(shuttles)})
}

func (s *Server) patchPlayer(c *fiber.Ctx) error {
	id := c.Params("id")
	_, _, sr, ok := s.playerAuth(c, id)
	if !ok {
		return nil
	}
	var body struct {
		ShuttlesUsed *int  `json:"shuttlesUsed"`
		Paid         *bool `json:"paid"`
	}
	if err := c.BodyParser(&body); err != nil {
		return errJSON(c, 400, "invalid body")
	}
	if body.ShuttlesUsed != nil {
		// Invariant 5: after close, only the paid toggle stays editable.
		if sr.Status != "open" {
			return errJSON(c, 409, "session is closed")
		}
		if *body.ShuttlesUsed < 0 {
			return errJSON(c, 400, "shuttlesUsed must be >= 0")
		}
		if _, err := s.db.Exec(`UPDATE session_players SET shuttles_used = ? WHERE id = ?`, *body.ShuttlesUsed, id); err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	if body.Paid != nil {
		if _, err := s.db.Exec(`UPDATE session_players SET paid = ? WHERE id = ?`, boolToInt(*body.Paid), id); err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	return c.JSON(fiber.Map{"ok": true})
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// ---------- Courts ----------

func (s *Server) addCourt(c *fiber.Ctx) error {
	sr, ok := s.sessionAuth(c, c.Params("id"))
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	var body struct {
		Label string `json:"label"`
	}
	c.BodyParser(&body)
	label := strings.TrimSpace(body.Label)
	if label == "" {
		var n int
		s.db.QueryRow(`SELECT COUNT(*) FROM courts WHERE session_id = ?`, sr.ID).Scan(&n)
		label = fmt.Sprintf("คอร์ท %d", n+1)
	}
	id := newID()
	if _, err := s.db.Exec(`INSERT INTO courts (id, session_id, label, status, created_at) VALUES (?,?,?,'active',?)`,
		id, sr.ID, label, nowMs()); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"courtId": id})
}

// courtAuth loads a court + its session and verifies admin access.
func (s *Server) courtAuth(c *fiber.Ctx, courtID string) (courtStatus string, sr *sessionRow, ok bool) {
	var sessionID string
	err := s.db.QueryRow(`SELECT session_id, status FROM courts WHERE id = ?`, courtID).Scan(&sessionID, &courtStatus)
	if err == sql.ErrNoRows {
		errJSON(c, 404, "court not found")
		return "", nil, false
	}
	if err != nil {
		errJSON(c, 500, err.Error())
		return "", nil, false
	}
	sr, ok = s.sessionAuth(c, sessionID)
	return courtStatus, sr, ok
}

func (s *Server) patchCourt(c *fiber.Ctx) error {
	id := c.Params("id")
	_, sr, ok := s.courtAuth(c, id)
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil || (body.Status != "closed" && body.Status != "active") {
		return errJSON(c, 400, "status must be \"active\" or \"closed\"")
	}
	if body.Status == "closed" {
		var active int
		s.db.QueryRow(`SELECT COUNT(*) FROM games WHERE court_id = ? AND ended_at IS NULL`, id).Scan(&active)
		if active > 0 {
			return errJSON(c, 409, "มีเกมค้างอยู่ในคอร์ทนี้ ต้องจบเกมก่อนปิดคอร์ท")
		}
	}
	if _, err := s.db.Exec(`UPDATE courts SET status = ? WHERE id = ?`, body.Status, id); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ---------- Games ----------

func (s *Server) startGame(c *fiber.Ctx) error {
	courtID := c.Params("id")
	courtStatus, sr, ok := s.courtAuth(c, courtID)
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	if courtStatus != "active" {
		return errJSON(c, 409, "court is closed")
	}
	var body struct {
		TeamA []string `json:"teamA"`
		TeamB []string `json:"teamB"`
	}
	if err := c.BodyParser(&body); err != nil {
		return errJSON(c, 400, "invalid body")
	}
	if len(body.TeamA) != 2 || len(body.TeamB) != 2 {
		return errJSON(c, 400, "teamA and teamB must each have 2 players")
	}
	all := append(append([]string{}, body.TeamA...), body.TeamB...)
	seen := map[string]bool{}
	for _, id := range all {
		if seen[id] {
			return errJSON(c, 400, "players must be distinct")
		}
		seen[id] = true
	}
	var active int
	s.db.QueryRow(`SELECT COUNT(*) FROM games WHERE court_id = ? AND ended_at IS NULL`, courtID).Scan(&active)
	if active > 0 {
		return errJSON(c, 409, "คอร์ทนี้มีเกมกำลังเล่นอยู่")
	}
	// Invariant 1: all 4 must be waiting in this session.
	for _, id := range all {
		var st, sid string
		err := s.db.QueryRow(`SELECT status, session_id FROM session_players WHERE id = ?`, id).Scan(&st, &sid)
		if err == sql.ErrNoRows || (err == nil && sid != sr.ID) {
			return errJSON(c, 404, "player not in this session: "+id)
		}
		if err != nil {
			return errJSON(c, 500, err.Error())
		}
		if st != "waiting" {
			return errJSON(c, 409, "ผู้เล่นบางคนไม่อยู่ในสถานะรอ")
		}
	}
	teamA, _ := json.Marshal(body.TeamA)
	teamB, _ := json.Marshal(body.TeamB)
	gameID := newID()
	tx, err := s.db.Begin()
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO games (id, session_id, court_id, team_a, team_b, started_at) VALUES (?,?,?,?,?,?)`,
		gameID, sr.ID, courtID, string(teamA), string(teamB), nowMs()); err != nil {
		return errJSON(c, 500, err.Error())
	}
	for _, id := range all {
		if _, err := tx.Exec(`UPDATE session_players SET status = 'playing' WHERE id = ?`, id); err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	if err := tx.Commit(); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"gameId": gameID})
}

func (s *Server) endGame(c *fiber.Ctx) error {
	gameID := c.Params("id")
	var sessionID, teamA, teamB string
	var endedAt sql.NullInt64
	err := s.db.QueryRow(`SELECT session_id, team_a, team_b, ended_at FROM games WHERE id = ?`, gameID).
		Scan(&sessionID, &teamA, &teamB, &endedAt)
	if err == sql.ErrNoRows {
		return errJSON(c, 404, "game not found")
	}
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	sr, ok := s.sessionAuth(c, sessionID)
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	if endedAt.Valid {
		return errJSON(c, 409, "game already ended")
	}
	var body struct {
		ShuttlesUsed *int `json:"shuttlesUsed"`
	}
	if err := c.BodyParser(&body); err != nil || body.ShuttlesUsed == nil {
		return errJSON(c, 400, "shuttlesUsed is required")
	}
	// Invariant 2: 0 is a normal, supported value.
	if *body.ShuttlesUsed < 0 {
		return errJSON(c, 400, "shuttlesUsed must be >= 0")
	}
	var a, b []string
	json.Unmarshal([]byte(teamA), &a)
	json.Unmarshal([]byte(teamB), &b)
	all := append(a, b...)
	now := nowMs()
	tx, err := s.db.Begin()
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE games SET ended_at = ?, shuttles_used = ? WHERE id = ?`, now, *body.ShuttlesUsed, gameID); err != nil {
		return errJSON(c, 500, err.Error())
	}
	for _, id := range all {
		// Wait clock resets to zero when the player returns to the queue.
		if _, err := tx.Exec(`UPDATE session_players
			SET status = 'waiting', waiting_since = ?, games_played = games_played + 1, shuttles_used = shuttles_used + ?
			WHERE id = ?`, now, *body.ShuttlesUsed, id); err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	if err := tx.Commit(); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ---------- Roster ----------

func (s *Server) listRoster(c *fiber.Ctx) error {
	groupID := c.Params("id")
	if ok, err := s.groupAuth(c, groupID); !ok {
		return err
	}
	q := strings.TrimSpace(c.Query("q"))
	query := `SELECT id, group_id, name, skill, avatar_seed FROM roster_players WHERE group_id = ? AND archived_at IS NULL`
	args := []any{groupID}
	if q != "" {
		query += ` AND name LIKE ?`
		args = append(args, "%"+q+"%")
	}
	query += ` ORDER BY name`
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	defer rows.Close()
	players := []RosterPlayer{}
	for rows.Next() {
		var p RosterPlayer
		if err := rows.Scan(&p.ID, &p.GroupID, &p.Name, &p.Skill, &p.AvatarSeed); err != nil {
			return errJSON(c, 500, err.Error())
		}
		players = append(players, p)
	}
	return c.JSON(players)
}

// rosterNameTaken reports whether another roster player in the group already uses
// this name, compared case-insensitively (COLLATE NOCASE). Pass excludeID to skip a
// player (e.g. the one being renamed) so saving an unchanged name isn't rejected.
func (s *Server) rosterNameTaken(groupID, name, excludeID string) (bool, error) {
	var found string
	err := s.db.QueryRow(
		`SELECT id FROM roster_players WHERE group_id = ? AND name = ? COLLATE NOCASE AND id != ? AND archived_at IS NULL LIMIT 1`,
		groupID, name, excludeID).Scan(&found)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *Server) addRosterPlayer(c *fiber.Ctx) error {
	groupID := c.Params("id")
	if ok, err := s.groupAuth(c, groupID); !ok {
		return err
	}
	var body struct {
		Name  string `json:"name"`
		Skill int    `json:"skill"`
	}
	if err := c.BodyParser(&body); err != nil {
		return errJSON(c, 400, "invalid body")
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		return errJSON(c, 400, "name is required")
	}
	if body.Skill < 1 || body.Skill > 4 {
		return errJSON(c, 400, "skill must be 1-4")
	}
	if taken, err := s.rosterNameTaken(groupID, body.Name, ""); err != nil {
		return errJSON(c, 500, err.Error())
	} else if taken {
		return errJSON(c, 409, "มีผู้เล่นชื่อนี้อยู่แล้ว")
	}
	id := newID()
	if _, err := s.db.Exec(`INSERT INTO roster_players (id, group_id, name, skill, avatar_seed) VALUES (?,?,?,?,?)`,
		id, groupID, body.Name, body.Skill, body.Name+"-"+id[:4]); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"id": id})
}

func (s *Server) patchRosterPlayer(c *fiber.Ctx) error {
	id := c.Params("id")
	var groupID string
	err := s.db.QueryRow(`SELECT group_id FROM roster_players WHERE id = ?`, id).Scan(&groupID)
	if err == sql.ErrNoRows {
		return errJSON(c, 404, "roster player not found")
	}
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	if ok, err := s.groupAuth(c, groupID); !ok {
		return err
	}
	var body struct {
		Name  *string `json:"name"`
		Skill *int    `json:"skill"`
	}
	if err := c.BodyParser(&body); err != nil {
		return errJSON(c, 400, "invalid body")
	}
	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		if name == "" {
			return errJSON(c, 400, "name cannot be empty")
		}
		if taken, err := s.rosterNameTaken(groupID, name, id); err != nil {
			return errJSON(c, 500, err.Error())
		} else if taken {
			return errJSON(c, 409, "มีผู้เล่นชื่อนี้อยู่แล้ว")
		}
		if _, err := s.db.Exec(`UPDATE roster_players SET name = ? WHERE id = ?`, name, id); err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	if body.Skill != nil {
		if *body.Skill < 1 || *body.Skill > 4 {
			return errJSON(c, 400, "skill must be 1-4")
		}
		if _, err := s.db.Exec(`UPDATE roster_players SET skill = ? WHERE id = ?`, *body.Skill, id); err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	return c.JSON(fiber.Map{"ok": true})
}

// deleteRosterPlayer removes a player from the group's registry. If the player has
// never been checked into a session the row is deleted outright. Once they have
// session_players (and game history through it), a hard delete would orphan that
// history, so we soft-delete instead: set archived_at so they drop out of the roster
// and check-in lists while their rows — and past games — stay intact.
func (s *Server) deleteRosterPlayer(c *fiber.Ctx) error {
	id := c.Params("id")
	var groupID string
	err := s.db.QueryRow(`SELECT group_id FROM roster_players WHERE id = ?`, id).Scan(&groupID)
	if err == sql.ErrNoRows {
		return errJSON(c, 404, "roster player not found")
	}
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	if ok, err := s.groupAuth(c, groupID); !ok {
		return err
	}
	var refs int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM session_players WHERE roster_player_id = ?`, id).Scan(&refs); err != nil {
		return errJSON(c, 500, err.Error())
	}
	if refs > 0 {
		if _, err := s.db.Exec(`UPDATE roster_players SET archived_at = ? WHERE id = ?`, nowMs(), id); err != nil {
			return errJSON(c, 500, err.Error())
		}
		return c.JSON(fiber.Map{"ok": true, "archived": true})
	}
	if _, err := s.db.Exec(`DELETE FROM roster_players WHERE id = ?`, id); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ---------- Match Queue ----------

func (s *Server) addToMatchQueue(c *fiber.Ctx) error {
	sr, ok := s.sessionAuth(c, c.Params("id"))
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	var body struct {
		TeamA []string `json:"teamA"`
		TeamB []string `json:"teamB"`
	}
	if err := c.BodyParser(&body); err != nil {
		return errJSON(c, 400, "invalid body")
	}
	if len(body.TeamA) != 2 || len(body.TeamB) != 2 {
		return errJSON(c, 400, "teamA and teamB must each have 2 players")
	}
	seen := map[string]bool{}
	for _, pid := range append(append([]string{}, body.TeamA...), body.TeamB...) {
		if seen[pid] {
			return errJSON(c, 400, "players must be distinct")
		}
		seen[pid] = true
	}
	for _, pid := range append(append([]string{}, body.TeamA...), body.TeamB...) {
		var sid string
		err := s.db.QueryRow(`SELECT session_id FROM session_players WHERE id = ?`, pid).Scan(&sid)
		if err == sql.ErrNoRows || (err == nil && sid != sr.ID) {
			return errJSON(c, 404, "player not in this session: "+pid)
		}
		if err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	teamA, _ := json.Marshal(body.TeamA)
	teamB, _ := json.Marshal(body.TeamB)
	mqID := newID()
	if _, err := s.db.Exec(`INSERT INTO match_queue (id, session_id, team_a, team_b, created_at) VALUES (?,?,?,?,?)`,
		mqID, sr.ID, string(teamA), string(teamB), nowMs()); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"matchQueueId": mqID})
}

func (s *Server) removeFromMatchQueue(c *fiber.Ctx) error {
	id := c.Params("id")
	var sessionID string
	err := s.db.QueryRow(`SELECT session_id FROM match_queue WHERE id = ?`, id).Scan(&sessionID)
	if err == sql.ErrNoRows {
		return errJSON(c, 404, "match queue item not found")
	}
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	sr, ok := s.sessionAuth(c, sessionID)
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	if _, err := s.db.Exec(`DELETE FROM match_queue WHERE id = ?`, id); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// startFromMatchQueue moves a queued match onto a court — validates players are
// still waiting (a queued player may have been manually assigned elsewhere first).
func (s *Server) startFromMatchQueue(c *fiber.Ctx) error {
	id := c.Params("id")
	var sessionID, teamA, teamB string
	err := s.db.QueryRow(`SELECT session_id, team_a, team_b FROM match_queue WHERE id = ?`, id).
		Scan(&sessionID, &teamA, &teamB)
	if err == sql.ErrNoRows {
		return errJSON(c, 404, "match queue item not found")
	}
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	sr, ok := s.sessionAuth(c, sessionID)
	if !ok {
		return nil
	}
	if sr.Status != "open" {
		return errJSON(c, 409, "session is closed")
	}
	var body struct {
		CourtID string `json:"courtId"`
	}
	if err := c.BodyParser(&body); err != nil || body.CourtID == "" {
		return errJSON(c, 400, "courtId is required")
	}
	var courtSessionID, courtStatus string
	err = s.db.QueryRow(`SELECT session_id, status FROM courts WHERE id = ?`, body.CourtID).
		Scan(&courtSessionID, &courtStatus)
	if err == sql.ErrNoRows || (err == nil && courtSessionID != sr.ID) {
		return errJSON(c, 404, "court not found in this session")
	}
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	if courtStatus != "active" {
		return errJSON(c, 409, "court is closed")
	}
	var active int
	s.db.QueryRow(`SELECT COUNT(*) FROM games WHERE court_id = ? AND ended_at IS NULL`, body.CourtID).Scan(&active)
	if active > 0 {
		return errJSON(c, 409, "คอร์ทนี้มีเกมกำลังเล่นอยู่")
	}
	var aIDs, bIDs []string
	json.Unmarshal([]byte(teamA), &aIDs)
	json.Unmarshal([]byte(teamB), &bIDs)
	all := append(aIDs, bIDs...)
	for _, pid := range all {
		var st, sid string
		if err := s.db.QueryRow(`SELECT status, session_id FROM session_players WHERE id = ?`, pid).Scan(&st, &sid); err != nil || sid != sr.ID {
			return errJSON(c, 404, "player not in this session: "+pid)
		}
		if st != "waiting" {
			return errJSON(c, 409, "ผู้เล่นบางคนไม่อยู่ในสถานะรอ — อาจถูกจัดลงสนามอื่นไปแล้ว")
		}
	}
	aJSON, _ := json.Marshal(aIDs)
	bJSON, _ := json.Marshal(bIDs)
	gameID := newID()
	tx, err := s.db.Begin()
	if err != nil {
		return errJSON(c, 500, err.Error())
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO games (id, session_id, court_id, team_a, team_b, started_at) VALUES (?,?,?,?,?,?)`,
		gameID, sr.ID, body.CourtID, string(aJSON), string(bJSON), nowMs()); err != nil {
		return errJSON(c, 500, err.Error())
	}
	for _, pid := range all {
		if _, err := tx.Exec(`UPDATE session_players SET status = 'playing' WHERE id = ?`, pid); err != nil {
			return errJSON(c, 500, err.Error())
		}
	}
	if _, err := tx.Exec(`DELETE FROM match_queue WHERE id = ?`, id); err != nil {
		return errJSON(c, 500, err.Error())
	}
	if err := tx.Commit(); err != nil {
		return errJSON(c, 500, err.Error())
	}
	return c.JSON(fiber.Map{"gameId": gameID})
}
