-- Add birth_date column for passcode change verification
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS birth_date text;

-- Ensure a settings row exists without touching passcode_hash
INSERT INTO app_settings (id, routing_mode, use_all_drives, warn_low_storage, low_storage_threshold)
VALUES (1, 'automatic', true, true, 10)
ON CONFLICT (id) DO NOTHING;
