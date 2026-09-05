-- Phase 9: Make passcode_hash nullable for first-time admin setup
-- When passcode_hash IS NULL, the app shows first-time setup screen
ALTER TABLE app_settings ALTER COLUMN passcode_hash DROP NOT NULL;

-- Clear the old hardcoded passcode hash (was SHA-256 of "110106")
UPDATE app_settings SET passcode_hash = NULL WHERE id = 1;