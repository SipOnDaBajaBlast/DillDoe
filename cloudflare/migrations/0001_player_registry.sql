CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  banned_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS players_username_unique
  ON players (username COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS players_created_at
  ON players (created_at);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  address_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);
