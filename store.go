package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS groups (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL,
	admin_token TEXT NOT NULL,
	config      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roster_players (
	id          TEXT PRIMARY KEY,
	group_id    TEXT NOT NULL REFERENCES groups(id),
	name        TEXT NOT NULL,
	skill       INTEGER NOT NULL,
	avatar_seed TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
	id       TEXT PRIMARY KEY,
	group_id TEXT NOT NULL REFERENCES groups(id),
	date     TEXT NOT NULL,
	status   TEXT NOT NULL DEFAULT 'open',
	config   TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS courts (
	id         TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id),
	label      TEXT NOT NULL,
	status     TEXT NOT NULL DEFAULT 'active',
	created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session_players (
	id               TEXT PRIMARY KEY,
	session_id       TEXT NOT NULL REFERENCES sessions(id),
	roster_player_id TEXT NOT NULL REFERENCES roster_players(id),
	status           TEXT NOT NULL DEFAULT 'waiting',
	checked_in_at    INTEGER NOT NULL,
	waiting_since    INTEGER NOT NULL,
	games_played     INTEGER NOT NULL DEFAULT 0,
	shuttles_used    INTEGER NOT NULL DEFAULT 0,
	paid             INTEGER NOT NULL DEFAULT 0,
	UNIQUE(session_id, roster_player_id)
);
CREATE TABLE IF NOT EXISTS match_queue (
	id          TEXT PRIMARY KEY,
	session_id  TEXT NOT NULL REFERENCES sessions(id),
	team_a      TEXT NOT NULL,
	team_b      TEXT NOT NULL,
	created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
	id            TEXT PRIMARY KEY,
	session_id    TEXT NOT NULL REFERENCES sessions(id),
	court_id      TEXT NOT NULL REFERENCES courts(id),
	team_a        TEXT NOT NULL,
	team_b        TEXT NOT NULL,
	started_at    INTEGER NOT NULL,
	ended_at      INTEGER,
	shuttles_used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_roster_group ON roster_players(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_courts_session ON courts(session_id);
CREATE INDEX IF NOT EXISTS idx_sp_session ON session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_games_session ON games(session_id);
`

func openDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	// modernc sqlite: serialize access through one connection to avoid write contention.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	// Idempotent migrations for columns added after initial deploy.
	db.Exec(`ALTER TABLE session_players ADD COLUMN note TEXT NOT NULL DEFAULT ''`)
	return db, nil
}

func newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func newToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}

func todayBangkok() string {
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	return time.Now().In(loc).Format("2006-01-02")
}
