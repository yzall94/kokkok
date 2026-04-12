import { createClient, type Client } from '@libsql/client'

let client: Client | null = null

export function getTurso(): Client | null {
  if (client) return client

  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url || url === 'YOUR_TURSO_URL') return null

  client = createClient({ url, authToken })
  return client
}

// Schema initialization — call once via /api/init-db
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS kokkok_entries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sender_name_encrypted TEXT NOT NULL,
  sender_phone_hash TEXT NOT NULL,
  target_phone_hash TEXT NOT NULL,
  hint_text TEXT,
  relationship TEXT,
  matched INTEGER DEFAULT 0,
  match_id TEXT,
  reveal_token TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT (datetime('now', '+30 days'))
);

CREATE INDEX IF NOT EXISTS idx_sender_hash ON kokkok_entries(sender_phone_hash);
CREATE INDEX IF NOT EXISTS idx_target_hash ON kokkok_entries(target_phone_hash);
CREATE INDEX IF NOT EXISTS idx_reveal_token ON kokkok_entries(reveal_token);
CREATE INDEX IF NOT EXISTS idx_matched ON kokkok_entries(matched);
`
