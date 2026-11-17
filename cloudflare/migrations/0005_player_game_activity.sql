-- Store each player's last opened game and the playtime per game.
-- The Worker adds these automatically when it reaches the database; this file
-- is for manual runs against an existing D1 database.

ALTER TABLE players ADD COLUMN last_game TEXT;
ALTER TABLE players ADD COLUMN last_game_title TEXT;
ALTER TABLE players ADD COLUMN last_game_at INTEGER;

CREATE TABLE IF NOT EXISTS player_game_playtime (
  player_id TEXT NOT NULL,
  game TEXT NOT NULL,
  title TEXT,
  seconds INTEGER NOT NULL DEFAULT 0,
  last_played_at INTEGER,
  PRIMARY KEY (player_id, game)
);
