-- Re-run the name reset after switching to letters-and-spaces-only names.
-- The Worker applies this automatically when NAME_VERSION changes;
-- this file is for manual runs against an existing D1 database.

UPDATE players SET previous_username = COALESCE(previous_username, username), name_version = 0;

INSERT INTO player_meta (key, value) VALUES ('name_version', '3')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
