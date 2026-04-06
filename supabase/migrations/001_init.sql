CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE kokkok_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name_encrypted TEXT NOT NULL,
  sender_phone_hash TEXT NOT NULL,
  sender_phone_encrypted TEXT NOT NULL,
  target_phone_hash TEXT NOT NULL,
  hint_text TEXT,
  matched BOOLEAN DEFAULT FALSE,
  match_id UUID REFERENCES kokkok_entries(id),
  reveal_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

CREATE TABLE verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes'
);

CREATE INDEX idx_entries_sender_hash ON kokkok_entries(sender_phone_hash);
CREATE INDEX idx_entries_target_hash ON kokkok_entries(target_phone_hash);
CREATE INDEX idx_entries_reveal_token ON kokkok_entries(reveal_token);
CREATE INDEX idx_verification_phone ON verification_codes(phone_hash);

ALTER TABLE kokkok_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- pgcrypto functions for Edge Functions
CREATE OR REPLACE FUNCTION insert_kokkok(
  p_sender_name TEXT,
  p_sender_phone TEXT,
  p_sender_phone_hash TEXT,
  p_target_phone_hash TEXT,
  p_hint_text TEXT,
  p_encryption_key TEXT
) RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO kokkok_entries (
    sender_name_encrypted,
    sender_phone_hash,
    sender_phone_encrypted,
    target_phone_hash,
    hint_text
  ) VALUES (
    encode(pgp_sym_encrypt(p_sender_name, p_encryption_key), 'base64'),
    p_sender_phone_hash,
    encode(pgp_sym_encrypt(p_sender_phone, p_encryption_key), 'base64'),
    p_target_phone_hash,
    p_hint_text
  ) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_reveal_data(
  p_reveal_token TEXT,
  p_encryption_key TEXT
) RETURNS JSON AS $$
DECLARE
  entry RECORD;
  match_entry RECORD;
  result JSON;
BEGIN
  SELECT * INTO entry FROM kokkok_entries WHERE reveal_token = p_reveal_token;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;
  IF entry.matched AND entry.match_id IS NOT NULL THEN
    SELECT * INTO match_entry FROM kokkok_entries WHERE id = entry.match_id;
    result := json_build_object(
      'matched', true,
      'partner_name', pgp_sym_decrypt(decode(match_entry.sender_name_encrypted, 'base64'), p_encryption_key),
      'partner_phone', pgp_sym_decrypt(decode(match_entry.sender_phone_encrypted, 'base64'), p_encryption_key),
      'hint_text', entry.hint_text
    );
  ELSE
    result := json_build_object(
      'matched', false,
      'hint_text', entry.hint_text
    );
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
