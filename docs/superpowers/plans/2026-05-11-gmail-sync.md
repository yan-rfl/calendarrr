# Gmail Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to connect their Gmail account so incoming ICS calendar invites are automatically imported as events.

**Architecture:** OAuth2 flow stores tokens in `email_connections`; Gmail `watch()` registers a Pub/Sub push subscription so new emails trigger `/api/webhooks/gmail`; the webhook fetches new messages via the History API, parses any ICS attachment, and creates an event. The watch self-renews inside the webhook when close to expiry.

**Tech Stack:** Next.js App Router, Supabase (service role for webhook, server client for auth routes), Google Gmail API, Google Pub/Sub push, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/utils/src/ics-parser.ts` | Create | Parse raw ICS string → structured event |
| `packages/utils/src/ics-parser.test.ts` | Create | Unit tests for ICS parser |
| `packages/utils/src/index.ts` | Modify | Export `parseICS` and `ICSEvent` |
| `apps/web/src/lib/gmail.ts` | Create | Gmail API helpers (token refresh, watch, history, message fetch) |
| `apps/web/src/app/api/settings/email/status/route.ts` | Create | `GET` — returns Gmail connection state |
| `apps/web/src/app/api/settings/email/status/route.test.ts` | Create | Tests for status route |
| `apps/web/src/app/api/settings/email/gmail/connect/route.ts` | Create | `GET` — redirects to Google OAuth |
| `apps/web/src/app/api/settings/email/gmail/connect/route.test.ts` | Create | Tests for connect route |
| `apps/web/src/app/api/settings/email/gmail/callback/route.ts` | Create | `GET` — exchanges code, stores tokens, registers watch |
| `apps/web/src/app/api/settings/email/gmail/callback/route.test.ts` | Create | Tests for callback route |
| `apps/web/src/app/api/settings/email/gmail/route.ts` | Create | `DELETE` — stops watch, removes connection |
| `apps/web/src/app/api/settings/email/gmail/route.test.ts` | Create | Tests for disconnect route |
| `apps/web/src/app/api/webhooks/gmail/route.ts` | Create | `POST` — Pub/Sub push handler |
| `apps/web/src/app/api/webhooks/gmail/route.test.ts` | Create | Tests for webhook |
| `apps/web/src/app/(dashboard)/settings/page.tsx` | Modify | Add Gmail sync card |
| `supabase/migrations/0008_email_connections_gmail.sql` | Create | Add `sync_metadata` JSONB + unique constraint |
| `packages/db/src/database.types.ts` | Modify | Add `sync_metadata` to `email_connections` types |
| `turbo.json` | Modify | Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PUBSUB_TOPIC` to build env |
| `.env.example` | Modify | Add `GOOGLE_PUBSUB_TOPIC` |

---

## Task 1: ICS Parser

**Files:**
- Create: `packages/utils/src/ics-parser.ts`
- Create: `packages/utils/src/ics-parser.test.ts`
- Modify: `packages/utils/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/utils/src/ics-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseICS } from './ics-parser'

const ICS_BASIC = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Dentist
DTSTART:20260510T140000Z
DTEND:20260510T150000Z
DESCRIPTION:Bring X-rays
END:VEVENT
END:VCALENDAR`

const ICS_DATE_ONLY = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:All Day Event
DTSTART;VALUE=DATE:20260510
END:VEVENT
END:VCALENDAR`

const ICS_FLOATING = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Meeting
DTSTART:20260510T090000
END:VEVENT
END:VCALENDAR`

const ICS_TZID = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Call
DTSTART;TZID=Asia/Jakarta:20260510T160000
END:VEVENT
END:VCALENDAR`

const ICS_ESCAPED = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Test
DTSTART:20260510T140000Z
DESCRIPTION:Line1\\nLine2\\,comma
END:VEVENT
END:VCALENDAR`

describe('parseICS', () => {
  it('parses name, start, end, detail from a basic ICS', () => {
    const result = parseICS(ICS_BASIC)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Dentist')
    expect(result!.start_at).toEqual(new Date('2026-05-10T14:00:00Z'))
    expect(result!.end_at).toEqual(new Date('2026-05-10T15:00:00Z'))
    expect(result!.detail).toBe('Bring X-rays')
  })

  it('parses date-only DTSTART as midnight UTC', () => {
    const result = parseICS(ICS_DATE_ONLY)
    expect(result).not.toBeNull()
    expect(result!.start_at).toEqual(new Date('2026-05-10T00:00:00Z'))
    expect(result!.end_at).toBeUndefined()
    expect(result!.detail).toBeUndefined()
  })

  it('parses floating datetime (no Z suffix)', () => {
    const result = parseICS(ICS_FLOATING)
    expect(result).not.toBeNull()
    expect(result!.start_at).toEqual(new Date('2026-05-10T09:00:00Z'))
  })

  it('parses TZID-prefixed DTSTART', () => {
    const result = parseICS(ICS_TZID)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Call')
    expect(result!.start_at.getUTCHours()).toBe(16)
  })

  it('unescapes \\n and \\, in description', () => {
    const result = parseICS(ICS_ESCAPED)
    expect(result!.detail).toBe('Line1\nLine2,comma')
  })

  it('returns null when SUMMARY is missing', () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260510T140000Z\nEND:VEVENT\nEND:VCALENDAR`
    expect(parseICS(ics)).toBeNull()
  })

  it('returns null when DTSTART is missing', () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Test\nEND:VEVENT\nEND:VCALENDAR`
    expect(parseICS(ics)).toBeNull()
  })

  it('returns null when no VEVENT block exists', () => {
    expect(parseICS('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBeNull()
  })

  it('parses the first VEVENT in a multi-event ICS', () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:First\nDTSTART:20260510T140000Z\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:Second\nDTSTART:20260511T140000Z\nEND:VEVENT\nEND:VCALENDAR`
    const result = parseICS(ics)
    expect(result!.name).toBe('First')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/utils && pnpm exec vitest run src/ics-parser.test.ts
```

Expected: FAIL — `Cannot find module './ics-parser'`

- [ ] **Step 3: Implement the ICS parser**

Create `packages/utils/src/ics-parser.ts`:

```typescript
export type ICSEvent = {
  name: string
  start_at: Date
  end_at?: Date
  detail?: string
}

export function parseICS(raw: string): ICSEvent | null {
  const veventMatch = raw.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/)
  if (!veventMatch) return null
  const block = veventMatch[1]

  const get = (key: string): string | undefined => {
    const match = block.match(new RegExp(`^${key}[;:][^\r\n]*`, 'm'))
    if (!match) return undefined
    return match[0].replace(/^[^:]+:/, '').trim()
  }

  const summary = get('SUMMARY')
  const dtstart = get('DTSTART')
  if (!summary || !dtstart) return null

  const dtend = get('DTEND')
  const description = get('DESCRIPTION')

  return {
    name: summary.replace(/\\,/g, ',').replace(/\\\\/g, '\\'),
    start_at: parseICSDate(dtstart),
    ...(dtend ? { end_at: parseICSDate(dtend) } : {}),
    ...(description ? { detail: description.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\') } : {}),
  }
}

function parseICSDate(value: string): Date {
  // Strip TZID param if present: "TZID=Asia/Jakarta:20260510T160000" → "20260510T160000"
  const raw = value.includes(':') ? value.split(':').pop()! : value

  if (raw.length === 8) {
    // Date only: 20260510
    return new Date(Date.UTC(
      parseInt(raw.slice(0, 4)),
      parseInt(raw.slice(4, 6)) - 1,
      parseInt(raw.slice(6, 8)),
    ))
  }

  // Datetime: 20260510T140000Z or 20260510T140000
  return new Date(Date.UTC(
    parseInt(raw.slice(0, 4)),
    parseInt(raw.slice(4, 6)) - 1,
    parseInt(raw.slice(6, 8)),
    parseInt(raw.slice(9, 11)),
    parseInt(raw.slice(11, 13)),
    parseInt(raw.slice(13, 15)),
  ))
}
```

- [ ] **Step 4: Export from utils index**

In `packages/utils/src/index.ts`, add at the end:

```typescript
export { parseICS } from './ics-parser'
export type { ICSEvent } from './ics-parser'
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/utils && pnpm exec vitest run
```

Expected: all tests PASS (including existing 36 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/utils/src/ics-parser.ts packages/utils/src/ics-parser.test.ts packages/utils/src/index.ts
git commit -m "feat: add ICS calendar invite parser"
```

---

## Task 2: DB Migration + Types

**Files:**
- Create: `supabase/migrations/0008_email_connections_gmail.sql`
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_email_connections_gmail.sql`:

```sql
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS sync_metadata JSONB;

ALTER TABLE email_connections
  ADD CONSTRAINT email_connections_user_provider_unique UNIQUE (user_id, provider);
```

- [ ] **Step 2: Apply the migration**

Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor):

```sql
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS sync_metadata JSONB;

ALTER TABLE email_connections
  ADD CONSTRAINT email_connections_user_provider_unique UNIQUE (user_id, provider);
```

Verify: go to Table Editor → `email_connections` → confirm `sync_metadata` column exists.

- [ ] **Step 3: Update database types**

In `packages/db/src/database.types.ts`, find the `email_connections` section and add `sync_metadata` to all three shapes:

```typescript
// In Row:
sync_metadata: import("./database.types").Json | null

// In Insert:
sync_metadata?: import("./database.types").Json | null

// In Update:
sync_metadata?: import("./database.types").Json | null
```

The full updated `email_connections` section should look like:

```typescript
email_connections: {
  Row: {
    access_token: string | null
    created_at: string
    id: string
    imap_host: string | null
    imap_password_encrypted: string | null
    imap_port: number | null
    imap_user: string | null
    last_synced_at: string | null
    provider: string
    refresh_token: string | null
    sync_metadata: Json | null
    user_id: string
  }
  Insert: {
    access_token?: string | null
    created_at?: string
    id?: string
    imap_host?: string | null
    imap_password_encrypted?: string | null
    imap_port?: number | null
    imap_user?: string | null
    last_synced_at?: string | null
    provider: string
    refresh_token?: string | null
    sync_metadata?: Json | null
    user_id: string
  }
  Update: {
    access_token?: string | null
    created_at?: string
    id?: string
    imap_host?: string | null
    imap_password_encrypted?: string | null
    imap_port?: number | null
    imap_user?: string | null
    last_synced_at?: string | null
    provider?: string
    refresh_token?: string | null
    sync_metadata?: Json | null
    user_id?: string
  }
  Relationships: []
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_email_connections_gmail.sql packages/db/src/database.types.ts
git commit -m "feat: add sync_metadata column and unique constraint to email_connections"
```

---

## Task 3: Gmail API Library

**Files:**
- Create: `apps/web/src/lib/gmail.ts`

No unit tests for this file — all functions are thin wrappers over external Google APIs.

- [ ] **Step 1: Create the library**

Create `apps/web/src/lib/gmail.ts`:

```typescript
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json()
  return data.access_token as string
}

export async function registerGmailWatch(accessToken: string): Promise<{ historyId: string; expiry: string }> {
  const res = await fetch(`${GMAIL_API}/users/me/watch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topicName: process.env.GOOGLE_PUBSUB_TOPIC!,
      labelIds: ['INBOX'],
    }),
  })
  if (!res.ok) throw new Error(`Gmail watch failed: ${res.status}`)
  const data = await res.json()
  return {
    historyId: String(data.historyId),
    expiry: new Date(parseInt(data.expiration)).toISOString(),
  }
}

export async function stopGmailWatch(accessToken: string): Promise<void> {
  await fetch(`${GMAIL_API}/users/me/stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function getGmailHistory(accessToken: string, startHistoryId: string): Promise<string[]> {
  const url = new URL(`${GMAIL_API}/users/me/history`)
  url.searchParams.set('startHistoryId', startHistoryId)
  url.searchParams.set('historyTypes', 'messageAdded')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (res.status === 404) return [] // historyId too old — no messages to replay
  if (!res.ok) throw new Error(`History API failed: ${res.status}`)
  const data = await res.json()
  const ids: string[] = []
  for (const record of (data.history ?? []) as Record<string, unknown>[]) {
    for (const msg of ((record.messagesAdded ?? []) as Record<string, unknown>[]) ) {
      const id = (msg.message as Record<string, string>)?.id
      if (id) ids.push(id)
    }
  }
  return [...new Set(ids)]
}

export async function getICSFromMessage(
  accessToken: string,
  messageId: string,
): Promise<{ ics: string; gmailId: string } | null> {
  const res = await fetch(`${GMAIL_API}/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const message = await res.json()
  const ics = findICSPart(message.payload as Record<string, unknown>)
  if (!ics) return null
  return { ics, gmailId: messageId }
}

function findICSPart(payload: Record<string, unknown>): string | null {
  const mimeType = payload.mimeType as string
  if (mimeType === 'text/calendar' || mimeType === 'application/ics') {
    const body = payload.body as Record<string, string>
    if (body?.data) return Buffer.from(body.data, 'base64').toString('utf-8')
  }
  for (const part of ((payload.parts ?? []) as Record<string, unknown>[])) {
    const found = findICSPart(part)
    if (found) return found
  }
  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/gmail.ts
git commit -m "feat: add Gmail API library (token refresh, watch, history, message fetch)"
```

---

## Task 4: Email Status API

**Files:**
- Create: `apps/web/src/app/api/settings/email/status/route.ts`
- Create: `apps/web/src/app/api/settings/email/status/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/app/api/settings/email/status/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

const mockSB = { auth: { getUser: vi.fn() }, from: vi.fn() }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))

describe('GET /api/settings/email/status', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns gmail connected: true when row exists', async () => {
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ provider: 'gmail', imap_user: 'user@gmail.com' }],
        error: null,
      }),
    })
    const res = await GET()
    const body = await res.json()
    expect(body.gmail.connected).toBe(true)
    expect(body.gmail.email).toBe('user@gmail.com')
  })

  it('returns gmail connected: false when no row exists', async () => {
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const res = await GET()
    const body = await res.json()
    expect(body.gmail.connected).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && pnpm exec vitest run src/app/api/settings/email/status/route.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/settings/email/status/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connections } = await supabase
    .from('email_connections')
    .select('provider, imap_user')
    .eq('user_id', user.id)

  const gmail = connections?.find(c => c.provider === 'gmail')

  return NextResponse.json({
    gmail: gmail
      ? { connected: true, email: gmail.imap_user }
      : { connected: false },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && pnpm exec vitest run src/app/api/settings/email/status/route.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/settings/email/status/
git commit -m "feat: add email connection status API"
```

---

## Task 5: Gmail OAuth Connect Route

**Files:**
- Create: `apps/web/src/app/api/settings/email/gmail/connect/route.ts`
- Create: `apps/web/src/app/api/settings/email/gmail/connect/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/app/api/settings/email/gmail/connect/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id')

const mockSB = { auth: { getUser: vi.fn() } }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))

const mockCookies = { set: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => mockCookies }))

const req = (url = 'http://localhost:3000/api/settings/email/gmail/connect') =>
  new Request(url)

describe('GET /api/settings/email/gmail/connect', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('redirects to Google OAuth with required params', async () => {
    const res = await GET(req())
    expect(res.status).toBe(307)
    const location = res.headers.get('location')!
    expect(location).toContain('accounts.google.com')
    expect(location).toContain('client_id=test-client-id')
    expect(location).toContain('gmail.readonly')
    expect(location).toContain('redirect_uri=')
    expect(location).toContain('state=')
  })

  it('sets oauth_state cookie', async () => {
    await GET(req())
    expect(mockCookies.set).toHaveBeenCalledWith(
      'oauth_state',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && pnpm exec vitest run src/app/api/settings/email/gmail/connect/route.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/settings/email/gmail/connect/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = crypto.randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('oauth_state', state, { httpOnly: true, secure: true, maxAge: 600, path: '/' })

  const origin = new URL(request.url).origin
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/settings/email/gmail/callback`,
    response_type: 'code',
    scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && pnpm exec vitest run src/app/api/settings/email/gmail/connect/route.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/settings/email/gmail/connect/
git commit -m "feat: Gmail OAuth connect route"
```

---

## Task 6: Gmail OAuth Callback Route

**Files:**
- Create: `apps/web/src/app/api/settings/email/gmail/callback/route.ts`
- Create: `apps/web/src/app/api/settings/email/gmail/callback/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/app/api/settings/email/gmail/callback/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csecret')

const mockSB = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))

const mockCookies = { get: vi.fn(), delete: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => mockCookies }))

vi.mock('@/lib/gmail', () => ({
  registerGmailWatch: vi.fn().mockResolvedValue({ historyId: '100', expiry: '2026-05-18T00:00:00Z' }),
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const req = (params = 'code=abc&state=validstate') =>
  new Request(`http://localhost:3000/api/settings/email/gmail/callback?${params}`)

describe('GET /api/settings/email/gmail/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCookies.get.mockReturnValue({ value: 'validstate' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at', refresh_token: 'rt' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ email: 'user@gmail.com' }) })
    mockSB.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })
  })

  it('redirects to /settings?error=oauth_failed when state mismatch', async () => {
    mockCookies.get.mockReturnValue({ value: 'differentstate' })
    const res = await GET(req('code=abc&state=wrongstate'))
    expect(res.headers.get('location')).toContain('error=oauth_failed')
  })

  it('redirects to /settings?error=oauth_failed when code is missing', async () => {
    const res = await GET(req('state=validstate'))
    expect(res.headers.get('location')).toContain('error=oauth_failed')
  })

  it('upserts email_connections and redirects to /settings?connected=gmail on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    mockSB.from.mockReturnValue({ upsert: upsertMock })

    const res = await GET(req())
    expect(res.headers.get('location')).toContain('connected=gmail')
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gmail', imap_user: 'user@gmail.com' }),
      expect.objectContaining({ onConflict: 'user_id,provider' }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && pnpm exec vitest run src/app/api/settings/email/gmail/callback/route.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/settings/email/gmail/callback/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { registerGmailWatch } from '@/lib/gmail'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const cookieStore = await cookies()
  const savedState = cookieStore.get('oauth_state')?.value
  cookieStore.delete('oauth_state')

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${url.origin}/settings?error=oauth_failed`)
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${url.origin}/login`)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: `${url.origin}/api/settings/email/gmail/callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return NextResponse.redirect(`${url.origin}/settings?error=oauth_failed`)
  const tokens = await tokenRes.json()

  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userinfo = await userinfoRes.json()

  const { historyId, expiry } = await registerGmailWatch(tokens.access_token)

  await supabase.from('email_connections').upsert(
    {
      user_id: user.id,
      provider: 'gmail',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      imap_user: userinfo.email,
      sync_metadata: { historyId, watchExpiry: expiry },
    },
    { onConflict: 'user_id,provider' },
  )

  return NextResponse.redirect(`${url.origin}/settings?connected=gmail`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && pnpm exec vitest run src/app/api/settings/email/gmail/callback/route.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/settings/email/gmail/callback/
git commit -m "feat: Gmail OAuth callback — exchange code, store tokens, register watch"
```

---

## Task 7: Gmail Disconnect Route

**Files:**
- Create: `apps/web/src/app/api/settings/email/gmail/route.ts`
- Create: `apps/web/src/app/api/settings/email/gmail/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/app/api/settings/email/gmail/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'

const mockDelete = vi.fn().mockReturnThis()
const mockSB = {
  auth: { getUser: vi.fn() },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { access_token: 'at', refresh_token: 'rt' } }),
    delete: mockDelete,
  })),
}
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))
vi.mock('@/lib/gmail', () => ({ stopGmailWatch: vi.fn().mockResolvedValue(undefined) }))

import { stopGmailWatch } from '@/lib/gmail'

describe('DELETE /api/settings/email/gmail', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('calls stopGmailWatch and deletes the row', async () => {
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { access_token: 'at' } }),
      delete: vi.fn().mockReturnThis(),
    })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(stopGmailWatch).toHaveBeenCalledWith('at')
  })

  it('still deletes row even when stopGmailWatch throws', async () => {
    const deleteMock = vi.fn().mockReturnThis()
    ;(stopGmailWatch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { access_token: 'at' } }),
      delete: deleteMock,
    })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(deleteMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && pnpm exec vitest run src/app/api/settings/email/gmail/route.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/settings/email/gmail/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { stopGmailWatch } from '@/lib/gmail'

export async function DELETE() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conn } = await supabase
    .from('email_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('provider', 'gmail')
    .single()

  if (conn?.access_token) {
    try { await stopGmailWatch(conn.access_token) } catch { /* best-effort */ }
  }

  await supabase
    .from('email_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'gmail')

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && pnpm exec vitest run src/app/api/settings/email/gmail/route.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/settings/email/gmail/route.ts apps/web/src/app/api/settings/email/gmail/route.test.ts
git commit -m "feat: Gmail disconnect route — stop watch and remove connection"
```

---

## Task 8: Gmail Webhook Receiver

**Files:**
- Create: `apps/web/src/app/api/webhooks/gmail/route.ts`
- Create: `apps/web/src/app/api/webhooks/gmail/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/app/api/webhooks/gmail/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

const mockSB = { from: vi.fn() }
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mockSB }))
vi.mock('@calendarrr/utils', () => ({
  parseICS: vi.fn().mockReturnValue({
    name: 'Dentist',
    start_at: new Date('2026-05-10T14:00:00Z'),
    end_at: new Date('2026-05-10T15:00:00Z'),
    detail: 'Bring X-rays',
  }),
}))
vi.mock('@/lib/gmail', () => ({
  getGmailHistory: vi.fn().mockResolvedValue(['msg1']),
  getICSFromMessage: vi.fn().mockResolvedValue({ ics: 'BEGIN:VCALENDAR...', gmailId: 'msg1' }),
  registerGmailWatch: vi.fn().mockResolvedValue({ historyId: '200', expiry: '2026-05-18T00:00:00Z' }),
  refreshAccessToken: vi.fn().mockResolvedValue('new-token'),
}))
vi.mock('@/lib/notifications', () => ({ generateNotificationQueue: vi.fn() }))

function makeBody(emailAddress: string, historyId: string) {
  const data = Buffer.from(JSON.stringify({ emailAddress, historyId })).toString('base64')
  return JSON.stringify({ message: { data } })
}

function makeConn(overrides = {}) {
  return {
    user_id: 'u1',
    access_token: 'at',
    refresh_token: 'rt',
    sync_metadata: { historyId: '99', watchExpiry: '2026-05-20T00:00:00Z' },
    ...overrides,
  }
}

function mockChain(conn: ReturnType<typeof makeConn> | null, existingEvent = false) {
  let callCount = 0
  mockSB.from.mockImplementation((table: string) => {
    if (table === 'email_connections') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: conn }),
        update: vi.fn().mockReturnThis(),
      }
    }
    if (table === 'events') {
      callCount++
      if (callCount === 1) {
        // dedup check
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: existingEvent ? { id: 'existing' } : null }),
        }
      }
      // insert
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'e1', start_at: '2026-05-10T14:00:00Z' }, error: null }),
      }
    }
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
  })
}

describe('POST /api/webhooks/gmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 for empty/malformed body', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(200)
  })

  it('returns 200 and creates event when valid ICS found', async () => {
    mockChain(makeConn())
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: makeBody('user@gmail.com', '100'),
    }))
    expect(res.status).toBe(200)
    const { generateNotificationQueue } = await import('@/lib/notifications')
    expect(generateNotificationQueue).toHaveBeenCalled()
  })

  it('skips duplicate events', async () => {
    mockChain(makeConn(), true)
    const { generateNotificationQueue } = await import('@/lib/notifications')
    vi.clearAllMocks()
    await POST(new Request('http://localhost', {
      method: 'POST',
      body: makeBody('user@gmail.com', '100'),
    }))
    expect(generateNotificationQueue).not.toHaveBeenCalled()
  })

  it('returns 200 when no connection found for email', async () => {
    mockChain(null)
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: makeBody('unknown@gmail.com', '100'),
    }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && pnpm exec vitest run src/app/api/webhooks/gmail/route.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement the webhook**

Create `apps/web/src/app/api/webhooks/gmail/route.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@calendarrr/db'
import { parseICS } from '@calendarrr/utils'
import { refreshAccessToken, getGmailHistory, getICSFromMessage, registerGmailWatch } from '@/lib/gmail'
import { generateNotificationQueue } from '@/lib/notifications'

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const messageData = body?.message?.data
    if (!messageData) return new Response('ok', { status: 200 })

    const decoded = JSON.parse(Buffer.from(messageData as string, 'base64').toString('utf-8'))
    const { emailAddress, historyId: newHistoryId } = decoded as { emailAddress: string; historyId: string }
    if (!emailAddress || !newHistoryId) return new Response('ok', { status: 200 })

    const supabase = serviceClient()
    const { data: conn } = await supabase
      .from('email_connections')
      .select('user_id, access_token, refresh_token, sync_metadata')
      .eq('provider', 'gmail')
      .eq('imap_user', emailAddress)
      .single()

    if (!conn) return new Response('ok', { status: 200 })

    const meta = (conn.sync_metadata ?? {}) as { historyId?: string; watchExpiry?: string }
    const storedHistoryId = meta.historyId ?? newHistoryId

    let accessToken = conn.access_token!
    let messageIds: string[]
    try {
      messageIds = await getGmailHistory(accessToken, storedHistoryId)
    } catch {
      if (!conn.refresh_token) return new Response('ok', { status: 200 })
      accessToken = await refreshAccessToken(conn.refresh_token)
      await supabase.from('email_connections').update({ access_token: accessToken })
        .eq('user_id', conn.user_id).eq('provider', 'gmail')
      messageIds = await getGmailHistory(accessToken, storedHistoryId)
    }

    for (const messageId of messageIds) {
      const found = await getICSFromMessage(accessToken, messageId)
      if (!found) continue

      const parsed = parseICS(found.ics)
      if (!parsed) continue

      const { data: existing } = await supabase
        .from('events').select('id')
        .eq('user_id', conn.user_id).eq('external_id', found.gmailId)
        .single()
      if (existing) continue

      const { data: event, error } = await supabase.from('events').insert({
        user_id: conn.user_id,
        name: parsed.name,
        start_at: parsed.start_at.toISOString(),
        end_at: parsed.end_at?.toISOString() ?? null,
        detail: parsed.detail ?? null,
        source: 'gmail',
        external_id: found.gmailId,
      }).select().single()

      if (error || !event) {
        await supabase.from('event_sync_log').insert({
          user_id: conn.user_id, source: 'gmail', external_id: found.gmailId,
          action: 'failed', detail: error?.message ?? 'insert failed',
        })
        continue
      }

      await generateNotificationQueue(supabase, conn.user_id, event.id, event.start_at)
      await supabase.from('event_sync_log').insert({
        user_id: conn.user_id, source: 'gmail', external_id: found.gmailId, action: 'created',
      })
    }

    const newMeta: Record<string, string> = { ...meta, historyId: newHistoryId }

    if (meta.watchExpiry && new Date(meta.watchExpiry).getTime() - Date.now() < 2 * 24 * 3600 * 1000) {
      const renewed = await registerGmailWatch(accessToken).catch(() => null)
      if (renewed) { newMeta.historyId = renewed.historyId; newMeta.watchExpiry = renewed.expiry }
    }

    await supabase.from('email_connections')
      .update({ sync_metadata: newMeta, last_synced_at: new Date().toISOString() })
      .eq('user_id', conn.user_id).eq('provider', 'gmail')

  } catch { /* always 200 to prevent Pub/Sub infinite retries */ }

  return new Response('ok', { status: 200 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && pnpm exec vitest run src/app/api/webhooks/gmail/route.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/webhooks/gmail/
git commit -m "feat: Gmail Pub/Sub webhook — fetch history, parse ICS, create events"
```

---

## Task 9: Settings UI — Gmail Card

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add Gmail state and fetch logic**

In `apps/web/src/app/(dashboard)/settings/page.tsx`, add the following inside the `SettingsPage` component, after the existing `lineStatus` state:

```typescript
type GmailStatus =
  | { state: 'loading' }
  | { state: 'connected'; email: string }
  | { state: 'disconnected' }
  | { state: 'error' }

// Inside SettingsPage, after the lineStatus useState:
const [gmailStatus, setGmailStatus] = useState<GmailStatus>({ state: 'loading' })

const fetchGmailStatus = useCallback(async () => {
  setGmailStatus({ state: 'loading' })
  try {
    const res = await fetch('/api/settings/email/status')
    const data = await res.json()
    if (data.gmail?.connected) {
      setGmailStatus({ state: 'connected', email: data.gmail.email })
    } else {
      setGmailStatus({ state: 'disconnected' })
    }
  } catch {
    setGmailStatus({ state: 'error' })
  }
}, [])

useEffect(() => {
  fetchGmailStatus()
  const params = new URLSearchParams(window.location.search)
  if (params.get('connected') === 'gmail') {
    window.history.replaceState({}, '', '/settings')
  }
}, [fetchGmailStatus])

async function disconnectGmail() {
  await fetch('/api/settings/email/gmail', { method: 'DELETE' })
  fetchGmailStatus()
}
```

- [ ] **Step 2: Add the Gmail card to the JSX**

Add this card between the LINE card and the notification offsets card (after the closing `</Card>` of the LINE card):

```tsx
<Card>
  <CardHeader>
    <CardTitle>Email Sync</CardTitle>
    <CardDescription>Connect Gmail to auto-import calendar invites (ICS attachments).</CardDescription>
  </CardHeader>
  <CardContent>
    {gmailStatus.state === 'loading' && (
      <p className="text-sm text-muted-foreground">Loading…</p>
    )}
    {gmailStatus.state === 'connected' && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-green-600 font-medium">✓ Connected</span>
          <span className="text-sm text-muted-foreground">{gmailStatus.email}</span>
        </div>
        <Button variant="outline" size="sm" onClick={disconnectGmail}>Disconnect</Button>
      </div>
    )}
    {gmailStatus.state === 'disconnected' && (
      <a href="/api/settings/email/gmail/connect">
        <Button variant="outline">Connect Gmail</Button>
      </a>
    )}
    {gmailStatus.state === 'error' && (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Failed to load Gmail status.</p>
        <Button variant="outline" size="sm" onClick={fetchGmailStatus}>Retry</Button>
      </div>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 3: Move the `GmailStatus` type to the top of the file**

Add `GmailStatus` type declaration at the top of the file alongside the existing `LineStatus` type (before the `SettingsPage` function).

- [ ] **Step 4: Run the full test suite to verify nothing broke**

```bash
cd apps/web && pnpm exec vitest run
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(dashboard)/settings/page.tsx
git commit -m "feat: add Gmail sync card to settings page"
```

---

## Task 10: Env Vars + Turbo Config

**Files:**
- Modify: `turbo.json`
- Modify: `.env.example`

- [ ] **Step 1: Update turbo.json**

In `turbo.json`, add the three Google vars to the `build.env` array:

```json
"env": [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_CHANNEL_SECRET",
  "NEXT_PUBLIC_LINE_ADD_FRIEND_URL",
  "ANTHROPIC_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_PUBSUB_TOPIC"
]
```

- [ ] **Step 2: Update .env.example**

Add `GOOGLE_PUBSUB_TOPIC=` to `.env.example` (it already has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`):

```
GOOGLE_PUBSUB_TOPIC=projects/your-project-id/topics/gmail-push
```

- [ ] **Step 3: Commit**

```bash
git add turbo.json .env.example
git commit -m "chore: add Google env vars to turbo.json and .env.example"
```

---

## Final Verification

- [ ] Run all tests: `pnpm --filter @calendarrr/utils exec vitest run && pnpm --filter web exec vitest run`
- [ ] All tests pass
- [ ] Push: `git push`
