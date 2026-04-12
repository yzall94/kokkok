// Turso HTTP API client (no native dependencies)

const TURSO_URL = process.env.TURSO_DATABASE_URL ?? ''
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN ?? ''

function getHttpUrl(): string | null {
  if (!TURSO_URL || TURSO_URL === 'YOUR_TURSO_URL') return null
  // Convert libsql:// to https://
  return TURSO_URL.replace('libsql://', 'https://')
}

interface TursoRow {
  [key: string]: string | number | null
}

interface TursoResult {
  rows: TursoRow[]
}

export async function execute(sql: string, args: (string | number | null)[] = []): Promise<TursoResult> {
  const url = getHttpUrl()
  if (!url) throw new Error('Turso not configured')

  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args: args.map(a => {
              if (a === null) return { type: 'null', value: null }
              if (typeof a === 'number') return { type: 'integer', value: String(a) }
              return { type: 'text', value: String(a) }
            }),
          },
        },
        { type: 'close' },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Turso error ${res.status}: ${text}`)
  }

  const data = await res.json()
  const result = data.results?.[0]

  if (result?.type === 'error') {
    throw new Error(result.error?.message || 'Turso query error')
  }

  const response = result?.response?.result
  if (!response) return { rows: [] }

  const cols = response.cols?.map((c: { name: string }) => c.name) || []
  const rows: TursoRow[] = (response.rows || []).map((row: { type: string; value: string | null }[]) => {
    const obj: TursoRow = {}
    row.forEach((cell: { type: string; value: string | null }, i: number) => {
      const key = cols[i]
      if (cell.type === 'integer') obj[key] = parseInt(cell.value as string, 10)
      else if (cell.type === 'null') obj[key] = null
      else obj[key] = cell.value
    })
    return obj
  })

  return { rows }
}

export async function executeBatch(statements: string[]): Promise<void> {
  const url = getHttpUrl()
  if (!url) throw new Error('Turso not configured')

  const requests: { type: string; stmt?: { sql: string } }[] = statements.map(sql => ({
    type: 'execute',
    stmt: { sql },
  }))
  requests.push({ type: 'close' })

  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Turso batch error ${res.status}: ${text}`)
  }
}

export function isConfigured(): boolean {
  return !!getHttpUrl()
}

export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS kokkok_entries (
    id TEXT PRIMARY KEY,
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sender_hash ON kokkok_entries(sender_phone_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_target_hash ON kokkok_entries(target_phone_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_reveal_token ON kokkok_entries(reveal_token)`,
  `CREATE INDEX IF NOT EXISTS idx_matched ON kokkok_entries(matched)`,
]
