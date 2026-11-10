-- Store the last library theme a player selected.
-- The Worker adds this column automatically when it reaches the database;
-- this file is for manual runs against an existing D1 database.

ALTER TABLE players ADD COLUMN theme TEXT;
