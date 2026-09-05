-- Phase 9: Make passcode_hash nullable for first-time admin setup
-- When passcode_hash IS NULL, the app shows first-time setup screen
ALTER TABLE app_settings ALTER COLUMN passcode_hash DROP NOT NULL;