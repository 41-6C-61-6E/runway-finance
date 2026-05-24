-- import_log.user_id was created with REFERENCES "user"(id) in 0031, but the app
-- uses the "users" table username as the user identifier. No other app table has
-- this FK on user_id. Drop it so import works.
ALTER TABLE import_log DROP CONSTRAINT IF EXISTS import_log_user_id_fkey;
