-- Add birth_date column for passcode change verification
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS birth_date text;

-- Set passcode to 110106 and birth date to 11 Januari 2006
-- SHA-256 of "110106" = 3918785174ae30856d9f0d07c0bf08408a02738907578a51c35ff9281508448c
UPDATE app_settings
SET passcode_hash = '3918785174ae30856d9f0d07c0bf08408a02738907578a51c35ff9281508448c',
    birth_date = '2006-01-11',
    updated_at = now()
WHERE id = 1;

-- If no row exists yet, insert it
INSERT INTO app_settings (id, passcode_hash, birth_date, routing_mode, use_all_drives, warn_low_storage, low_storage_threshold)
VALUES (1, '3918785174ae30856d9f0d07c0bf08408a02738907578a51c35ff9281508448c', '2006-01-11', 'automatic', true, true, 10)
ON CONFLICT (id) DO NOTHING;
