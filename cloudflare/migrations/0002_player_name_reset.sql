-- Ask every player, including ones who already picked a name, to enter one again
-- under the stricter rules.
-- The Worker applies this automatically the first time it reaches the database;
-- this file is for manual runs against an existing D1 database.

ALTER TABLE players ADD COLUMN name_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN previous_username TEXT;

CREATE TABLE IF NOT EXISTS player_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

UPDATE players SET previous_username = COALESCE(previous_username, username), name_version = 0;

INSERT INTO player_meta (key, value) VALUES ('name_version', '2')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
