-- Columns required for Resend email sending
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS full_name      text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS email_signature text;
ALTER TABLE applications   ADD COLUMN IF NOT EXISTS sent_via_email boolean DEFAULT false;
