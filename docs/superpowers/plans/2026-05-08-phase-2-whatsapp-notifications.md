# Phase 2: WhatsApp Bot + Notification Dispatcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WhatsApp bot for full CRUD via structured text commands and a Supabase Edge Function that dispatches WhatsApp reminder notifications.

**Architecture:** The WhatsApp command parser lives in `packages/utils` as a pure function (zero dependencies, fully testable). The Meta webhook at `/api/webhooks/whatsapp` receives messages, looks up the user by phone, runs the parser, and executes commands using a service-role Supabase client (bypasses RLS since it's called by Meta, not an authenticated user). On every event creation (web UI or WhatsApp), notification queue rows are generated from the user's notification rules. A Supabase Edge Function cron (1-minute interval) drains the queue by sending WhatsApp messages via Meta's Cloud API.

**Tech Stack:** Next.js 16 API routes, `@supabase/supabase-js` v2, `@anthropic-ai/sdk` (claude-haiku-4-5 NLU fallback), Supabase Edge Functions (Deno), WhatsApp Business Cloud API (Meta), Vitest

---

## Environment Variables

Add these to `apps/web/.env.local` and Vercel project settings:
```
WHATSAPP_TOKEN=                   # Meta Business API bearer token
WHATSAPP_PHONE_NUMBER_ID=         # Meta phone number ID
WHATSAPP_VERIFY_TOKEN=calendarrrverify   # Any string — used to verify webhook
ANTHROPIC_API_KEY=                # For Haiku NLU fallback
```

---

## File Map

```
packages/utils/src/
  whatsapp-parser.ts        # Pure parseWhatsAppMessage() — regex + relative datetime
  whatsapp-parser.test.ts   # Unit tests
  index.ts                  # Add re-exports (modify)

apps/web/src/
  lib/
    whatsapp.ts             # sendWhatsAppMessage(), formatNotificationMessage()
    notifications.ts        # generateNotificationQueue()
    notifications.test.ts
  app/api/
    webhooks/whatsapp/
      route.ts              # GET (verify handshake) + POST (handle message)
      route.test.ts
    settings/whatsapp/verify/
      route.ts              # POST — send OTP or verify OTP
      route.test.ts
  app/(dashboard)/settings/
    page.tsx                # Add phone verification card (replace)

supabase/
  migrations/
    0002_whatsapp_otp.sql   # Add pending_otp columns to whatsapp_sessions
  functions/
    notify/
      index.ts              # Deno Edge Function — drain notification_queue
```

---

## Task 1: WhatsApp Command Parser

**Files:**
- Create: `packages/utils/src/whatsapp-parser.ts`
- Create: `packages/utils/src/whatsapp-parser.test.ts`
- Modify: `packages/utils/src/index.ts`

- [ ] **Create test file — `packages/utils/src/whatsapp-parser.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { parseWhatsAppMessage } from './whatsapp-parser'

const NOW = new Date('2026-05-08T10:00:00.000Z')

describe('help', () => {
  it('parses help', () => {
    expect(parseWhatsAppMessage('help', NOW)).toEqual({ type: 'help' })
  })
})

describe('list today', () => {
  it('parses "today"', () => {
    expect(parseWhatsAppMessage('today', NOW)).toEqual({ type: 'list_today' })
  })
  it('parses "list today"', () => {
    expect(parseWhatsAppMessage('list today', NOW)).toEqual({ type: 'list_today' })
  })
})

describe('list upcoming', () => {
  it('parses "upcoming"', () => {
    expect(parseWhatsAppMessage('upcoming', NOW)).toEqual({ type: 'list_upcoming' })
  })
  it('parses "next"', () => {
    expect(parseWhatsAppMessage('next', NOW)).toEqual({ type: 'list_upcoming' })
  })
})

describe('list by date', () => {
  it('parses list date', () => {
    expect(parseWhatsAppMessage('list 2026-05-10', NOW)).toEqual({ type: 'list_date', date: '2026-05-10' })
  })
})

describe('delete', () => {
  it('parses delete', () => {
    expect(parseWhatsAppMessage('delete Dentist', NOW)).toEqual({ type: 'delete', name: 'Dentist' })
  })
  it('preserves name casing', () => {
    expect(parseWhatsAppMessage('delete My Meeting', NOW)).toEqual({ type: 'delete', name: 'My Meeting' })
  })
})

describe('update', () => {
  it('parses update to datetime', () => {
    const result = parseWhatsAppMessage('update Dentist to 2026-05-10 14:00', NOW)
    expect(result.type).toBe('update')
    if (result.type === 'update') {
      expect(result.name).toBe('Dentist')
      expect(result.start_at.getFullYear()).toBe(2026)
      expect(result.start_at.getMonth()).toBe(4)
      expect(result.start_at.getDate()).toBe(10)
    }
  })
})

describe('remind', () => {
  it('parses remind N min before', () => {
    expect(parseWhatsAppMessage('remind Dentist 30 min before', NOW))
      .toEqual({ type: 'remind', name: 'Dentist', offset_minutes: -30 })
  })
  it('parses remind N minutes before', () => {
    expect(parseWhatsAppMessage('remind Dentist 15 minutes before', NOW))
      .toEqual({ type: 'remind', name: 'Dentist', offset_minutes: -15 })
  })
  it('parses remind N hour before', () => {
    expect(parseWhatsAppMessage('remind Dentist 1 hour before', NOW))
      .toEqual({ type: 'remind', name: 'Dentist', offset_minutes: -60 })
  })
  it('parses remind N hours before', () => {
    expect(parseWhatsAppMessage('remind Meeting 2 hours before', NOW))
      .toEqual({ type: 'remind', name: 'Meeting', offset_minutes: -120 })
  })
})

describe('create structured', () => {
  it('parses Name_date time', () => {
    const result = parseWhatsAppMessage('Dentist_2026-05-10 14:00', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Dentist')
      expect(result.detail).toBeUndefined()
    }
  })
  it('parses Name_date time_detail', () => {
    const result = parseWhatsAppMessage('Dentist_2026-05-10 14:00_Bring X-rays', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Dentist')
      expect(result.detail).toBe('Bring X-rays')
    }
  })
})

describe('create relative', () => {
  it('parses Today at time', () => {
    const result = parseWhatsAppMessage('Get Laundry_Today at 12:00 PM', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Get Laundry')
      expect(result.start_at.getHours()).toBe(12)
      expect(result.start_at.getMinutes()).toBe(0)
    }
  })
  it('parses Tomorrow at time', () => {
    const result = parseWhatsAppMessage('Meeting_Tomorrow at 9:00 AM', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      const tomorrow = new Date(NOW)
      tomorrow.setDate(tomorrow.getDate() + 1)
      expect(result.start_at.getDate()).toBe(tomorrow.getDate())
    }
  })
  it('parses In N minutes', () => {
    const result = parseWhatsAppMessage('Call_In 30 minutes', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      const expected = new Date(NOW.getTime() + 30 * 60000)
      expect(result.start_at.getTime()).toBeCloseTo(expected.getTime(), -3)
    }
  })
  it('parses In N hours', () => {
    const result = parseWhatsAppMessage('Lunch_In 2 hours', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      const expected = new Date(NOW.getTime() + 2 * 3600000)
      expect(result.start_at.getTime()).toBeCloseTo(expected.getTime(), -3)
    }
  })
  it('parses In a minute', () => {
    const result = parseWhatsAppMessage('Ping_In a minute', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      const expected = new Date(NOW.getTime() + 60000)
      expect(result.start_at.getTime()).toBeCloseTo(expected.getTime(), -3)
    }
  })
})

describe('unknown', () => {
  it('returns unknown for unrecognized input', () => {
    expect(parseWhatsAppMessage('what is the weather', NOW))
      .toEqual({ type: 'unknown', raw: 'what is the weather' })
  })
})
```

- [ ] **Run test — confirm FAIL**
```bash
cd packages/utils && pnpm test
# Expected: FAIL — whatsapp-parser.ts does not exist
```

- [ ] **Create `packages/utils/src/whatsapp-parser.ts`**

```typescript
export type ParseResult =
  | { type: 'create'; name: string; start_at: Date; detail?: string }
  | { type: 'list_today' }
  | { type: 'list_date'; date: string }
  | { type: 'list_upcoming' }
  | { type: 'update'; name: string; start_at: Date }
  | { type: 'remind'; name: string; offset_minutes: number }
  | { type: 'delete'; name: string }
  | { type: 'help' }
  | { type: 'unknown'; raw: string }

export function parseWhatsAppMessage(text: string, now: Date = new Date()): ParseResult {
  const t = text.trim()
  const lower = t.toLowerCase()

  if (lower === 'help') return { type: 'help' }
  if (lower === 'today' || lower === 'list today') return { type: 'list_today' }
  if (lower === 'upcoming' || lower === 'next') return { type: 'list_upcoming' }

  const listDate = t.match(/^list\s+(\d{4}-\d{2}-\d{2})$/i)
  if (listDate) return { type: 'list_date', date: listDate[1] }

  const del = t.match(/^delete\s+(.+)$/i)
  if (del) return { type: 'delete', name: del[1].trim() }

  const upd = t.match(/^update\s+(.+?)\s+to\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/i)
  if (upd) return { type: 'update', name: upd[1].trim(), start_at: new Date(`${upd[2]}T${upd[3]}:00`) }

  const remind = t.match(/^remind\s+(.+?)\s+(\d+)\s+(min(?:utes?)?|hours?)\s+before$/i)
  if (remind) {
    const n = parseInt(remind[2])
    const offset_minutes = remind[3].toLowerCase().startsWith('h') ? -(n * 60) : -n
    return { type: 'remind', name: remind[1].trim(), offset_minutes }
  }

  const structured = t.match(/^(.+?)_(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?:_(.+))?$/)
  if (structured) {
    return {
      type: 'create',
      name: structured[1].trim(),
      start_at: new Date(`${structured[2]}T${structured[3]}:00`),
      ...(structured[4] ? { detail: structured[4].trim() } : {}),
    }
  }

  const todayAt = t.match(/^(.+?)_Today at (\d{1,2}:\d{2})\s*(AM|PM)$/i)
  if (todayAt) return { type: 'create', name: todayAt[1].trim(), start_at: parseLocalTime(todayAt[2], todayAt[3], now, 0) }

  const tomorrowAt = t.match(/^(.+?)_Tomorrow at (\d{1,2}:\d{2})\s*(AM|PM)$/i)
  if (tomorrowAt) return { type: 'create', name: tomorrowAt[1].trim(), start_at: parseLocalTime(tomorrowAt[2], tomorrowAt[3], now, 1) }

  const inRelative = t.match(/^(.+?)_In (a|\d+)\s+(minutes?|hours?)$/i)
  if (inRelative) {
    const n = inRelative[2].toLowerCase() === 'a' ? 1 : parseInt(inRelative[2])
    const ms = inRelative[3].toLowerCase().startsWith('h') ? n * 3600000 : n * 60000
    return { type: 'create', name: inRelative[1].trim(), start_at: new Date(now.getTime() + ms) }
  }

  return { type: 'unknown', raw: t }
}

function parseLocalTime(timeStr: string, meridiem: string, base: Date, dayOffset: number): Date {
  const [hStr, mStr] = timeStr.split(':')
  let h = parseInt(hStr)
  const m = parseInt(mStr)
  if (meridiem.toUpperCase() === 'PM' && h !== 12) h += 12
  if (meridiem.toUpperCase() === 'AM' && h === 12) h = 0
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}
```

- [ ] **Run test — confirm PASS**
```bash
pnpm test
# Expected: all tests pass
```

- [ ] **Add exports to `packages/utils/src/index.ts`**

Append to the existing file (do NOT remove the existing formatEventDate/formatEventTime exports):
```typescript
export { parseWhatsAppMessage } from './whatsapp-parser'
export type { ParseResult } from './whatsapp-parser'
```

- [ ] **Commit**
```bash
cd ../.. && git add packages/utils/
git commit -m "feat: whatsapp command parser with relative datetime support"
```

---

## Task 2: WhatsApp API Client + turbo.json env

**Files:**
- Create: `apps/web/src/lib/whatsapp.ts`
- Modify: `apps/web/package.json` (add @anthropic-ai/sdk)
- Modify: `turbo.json` (add new env vars to build task)

- [ ] **Install Anthropic SDK**
```bash
cd apps/web && pnpm add @anthropic-ai/sdk
```

Expected: `@anthropic-ai/sdk` appears in `apps/web/package.json` dependencies.

- [ ] **Update `turbo.json` build env** (at repo root `/Users/ryan/Work/Personal/CalendaRRR/turbo.json`)

Replace the existing `"env"` array in the `"build"` task with:
```json
"env": [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "ANTHROPIC_API_KEY"
]
```

- [ ] **Create `apps/web/src/lib/whatsapp.ts`**

```typescript
const BASE = 'https://graph.facebook.com/v18.0'

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!
  const token = process.env.WHATSAPP_TOKEN!
  const res = await fetch(`${BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WhatsApp API error ${res.status}: ${err}`)
  }
}

export function formatNotificationMessage(name: string, startAt: string, detail?: string | null): string {
  const d = new Date(startAt)
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return [`⏰ Reminder: ${name}`, `📅 ${dateStr} at ${timeStr}`, detail ? `📝 ${detail}` : null]
    .filter(Boolean).join('\n')
}
```

- [ ] **Commit**
```bash
cd ../.. && git add apps/web/src/lib/whatsapp.ts apps/web/package.json turbo.json
git commit -m "feat: whatsapp api client and update turbo.json env vars"
```

---

## Task 3: Phone Verification Migration + API

**Files:**
- Create: `supabase/migrations/0002_whatsapp_otp.sql`
- Create: `apps/web/src/app/api/settings/whatsapp/verify/route.ts`
- Create: `apps/web/src/app/api/settings/whatsapp/verify/route.test.ts`

- [ ] **Create `supabase/migrations/0002_whatsapp_otp.sql`**

```sql
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS pending_otp TEXT,
  ADD COLUMN IF NOT EXISTS pending_otp_expires_at TIMESTAMPTZ;
```

- [ ] **Push migration**
```bash
pnpm supabase db push
# Expected: migration applied successfully
```

- [ ] **Regenerate TypeScript types**
```bash
pnpm supabase gen types typescript --project-id vrreicixdobccaobcgqw \
  > packages/db/src/database.types.ts
```

Expected: `whatsapp_sessions` Row type now includes `pending_otp: string | null` and `pending_otp_expires_at: string | null`.

- [ ] **Write test — `apps/web/src/app/api/settings/whatsapp/verify/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

const mockSB = { auth: { getUser: vi.fn() }, from: vi.fn() }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined) }))

const req = (body: unknown) => new Request('http://localhost/api/settings/whatsapp/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/settings/whatsapp/verify', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(req({ phone: '+1234567890' }))).status).toBe(401)
  })

  it('returns 400 for missing phone', async () => {
    expect((await POST(req({}))).status).toBe(400)
  })

  it('sends OTP and returns sent: true when no otp provided', async () => {
    mockSB.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
    const res = await POST(req({ phone: '+1234567890' }))
    expect(res.status).toBe(200)
    expect((await res.json()).sent).toBe(true)
  })

  it('returns 400 for wrong OTP', async () => {
    const expires = new Date(Date.now() + 60000).toISOString()
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { pending_otp: '123456', pending_otp_expires_at: expires },
        error: null,
      }),
    })
    expect((await POST(req({ phone: '+1234567890', otp: '999999' }))).status).toBe(400)
  })

  it('verifies correct OTP and returns verified: true', async () => {
    const expires = new Date(Date.now() + 60000).toISOString()
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { pending_otp: '123456', pending_otp_expires_at: expires },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    })
    const res = await POST(req({ phone: '+1234567890', otp: '123456' }))
    expect(res.status).toBe(200)
    expect((await res.json()).verified).toBe(true)
  })
})
```

- [ ] **Run — confirm FAIL**
```bash
cd apps/web && pnpm test app/api/settings/whatsapp/verify/route.test.ts
```

- [ ] **Create `apps/web/src/app/api/settings/whatsapp/verify/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { z } from 'zod'

const schema = z.object({
  phone: z.string().min(7),
  otp: z.string().length(6).optional(),
})

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { phone, otp } = parsed.data

  if (!otp) {
    const code = generateOtp()
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const { error } = await supabase.from('whatsapp_sessions').upsert(
      { user_id: user.id, phone_number: phone, pending_otp: code, pending_otp_expires_at: expires },
      { onConflict: 'user_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await sendWhatsAppMessage(phone, `Your CalendaRRR verification code: ${code}\n\nExpires in 10 minutes.`)
    return NextResponse.json({ sent: true })
  }

  const { data: session, error } = await supabase
    .from('whatsapp_sessions')
    .select('pending_otp, pending_otp_expires_at')
    .eq('user_id', user.id)
    .single()
  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (
    session.pending_otp !== otp ||
    !session.pending_otp_expires_at ||
    new Date(session.pending_otp_expires_at) < new Date()
  ) return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })

  await supabase.from('whatsapp_sessions').update({
    verified_at: new Date().toISOString(),
    pending_otp: null,
    pending_otp_expires_at: null,
  }).eq('user_id', user.id)

  return NextResponse.json({ verified: true })
}
```

- [ ] **Run — confirm PASS**
```bash
pnpm test app/api/settings/whatsapp/verify/route.test.ts
```

- [ ] **Commit**
```bash
cd ../.. && git add supabase/migrations/0002_whatsapp_otp.sql packages/db/src/database.types.ts apps/web/src/app/api/settings/whatsapp/
git commit -m "feat: whatsapp phone verification with OTP"
```

---

## Task 4: WhatsApp Webhook

**Files:**
- Create: `apps/web/src/app/api/webhooks/whatsapp/route.ts`
- Create: `apps/web/src/app/api/webhooks/whatsapp/route.test.ts`

Note: `proxy.ts` already excludes `api/webhooks/*` from auth middleware. This route is called by Meta, not authenticated users. It uses a service-role Supabase client created with `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS.

- [ ] **Write test — `apps/web/src/app/api/webhooks/whatsapp/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/notifications', () => ({
  generateNotificationQueue: vi.fn().mockResolvedValue(undefined),
}))

const mockSB = { from: vi.fn() }
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mockSB }))

vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'test-verify-token')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')

const getReq = (params: Record<string, string>) => {
  const url = new URL('http://localhost/api/webhooks/whatsapp')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url)
}

const postReq = (body: unknown) => new Request('http://localhost/api/webhooks/whatsapp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const makePayload = (from: string, body: string) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: {
    messages: [{ from, type: 'text', text: { body } }],
    contacts: [{ wa_id: from }],
  } }] }],
})

const mockChain = () => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  single: vi.fn().mockResolvedValue({ data: { user_id: 'u1' }, error: null }),
  insert: vi.fn().mockResolvedValue({ data: { id: 'e1', name: 'Test', start_at: '2026-05-10T14:00:00Z' }, error: null }),
})

describe('GET /api/webhooks/whatsapp', () => {
  it('returns challenge when verify token matches', async () => {
    const res = await GET(getReq({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test-verify-token',
      'hub.challenge': 'abc123',
    }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('abc123')
  })

  it('returns 403 when verify token mismatches', async () => {
    const res = await GET(getReq({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong',
      'hub.challenge': 'abc123',
    }))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/webhooks/whatsapp', () => {
  beforeEach(() => {
    mockSB.from.mockReturnValue(mockChain())
  })

  it('returns 200 for valid payload', async () => {
    const res = await POST(postReq(makePayload('+1234567890', 'today')))
    expect(res.status).toBe(200)
  })

  it('returns 200 when user not found (silently ignores)', async () => {
    mockSB.from.mockReturnValueOnce({
      ...mockChain(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })
    expect((await POST(postReq(makePayload('+9999', 'today')))).status).toBe(200)
  })

  it('returns 200 for non-text message type', async () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ from: '+1234', type: 'image' }] } }] }],
    }
    expect((await POST(postReq(payload))).status).toBe(200)
  })
})
```

- [ ] **Run — confirm FAIL**
```bash
cd apps/web && pnpm test app/api/webhooks/whatsapp/route.test.ts
```

- [ ] **Create `apps/web/src/app/api/webhooks/whatsapp/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@calendarrr/db'
import { parseWhatsAppMessage, type ParseResult } from '@calendarrr/utils'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { generateNotificationQueue } from '@/lib/notifications'
import Anthropic from '@anthropic-ai/sdk'

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: true })

  const value = body?.entry?.[0]?.changes?.[0]?.value
  const message = value?.messages?.[0]
  if (!message || message.type !== 'text') return NextResponse.json({ ok: true })

  const from: string = message.from
  const text: string = message.text.body

  const supabase = serviceClient()
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('user_id')
    .eq('phone_number', from)
    .not('verified_at', 'is', null)
    .single()

  if (!session) return NextResponse.json({ ok: true })

  let parsed = parseWhatsAppMessage(text)
  if (parsed.type === 'unknown') parsed = await nlpFallback(text)

  await executeCommand(supabase, session.user_id, from, parsed)
  return NextResponse.json({ ok: true })
}

async function nlpFallback(text: string): Promise<ParseResult> {
  try {
    const client = new Anthropic()
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Convert this calendar request to a structured command. Reply with ONLY one of these exact formats (no explanation):
- Name_YYYY-MM-DD HH:MM
- Name_YYYY-MM-DD HH:MM_Detail
- delete Name
- update Name to YYYY-MM-DD HH:MM
- today
- upcoming
- help

Message: "${text}"
Today's date: ${new Date().toISOString().slice(0, 10)}`,
      }],
    })
    const reply = (msg.content[0] as { text: string }).text.trim()
    return parseWhatsAppMessage(reply)
  } catch {
    return { type: 'unknown', raw: text }
  }
}

type SB = ReturnType<typeof serviceClient>

async function executeCommand(supabase: SB, userId: string, phone: string, parsed: ParseResult): Promise<void> {
  switch (parsed.type) {
    case 'help': {
      await sendWhatsAppMessage(phone, [
        '📅 *CalendaRRR Commands*',
        '',
        '*Create:* Name_YYYY-MM-DD HH:MM',
        '*With detail:* Name_YYYY-MM-DD HH:MM_Detail',
        '*Today:* Name_Today at H:MM AM/PM',
        '*Tomorrow:* Name_Tomorrow at H:MM AM/PM',
        '*Relative:* Name_In N minutes/hours',
        '',
        '*List today:* today',
        '*List date:* list YYYY-MM-DD',
        '*Upcoming:* upcoming',
        '',
        '*Update:* update Name to YYYY-MM-DD HH:MM',
        '*Delete:* delete Name',
        '*Reminder:* remind Name N min/hour before',
      ].join('\n'))
      break
    }

    case 'list_today': {
      const today = new Date()
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
      const { data: events } = await supabase.from('events').select('name, start_at')
        .eq('user_id', userId).gte('start_at', from).lt('start_at', to).order('start_at')
      const msg = events?.length
        ? events.map(e => `• ${e.name} at ${new Date(e.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`).join('\n')
        : 'No events today.'
      await sendWhatsAppMessage(phone, `📅 *Today's events:*\n${msg}`)
      break
    }

    case 'list_date': {
      const from = new Date(parsed.date + 'T00:00:00').toISOString()
      const to = new Date(parsed.date + 'T23:59:59').toISOString()
      const { data: events } = await supabase.from('events').select('name, start_at')
        .eq('user_id', userId).gte('start_at', from).lte('start_at', to).order('start_at')
      const msg = events?.length
        ? events.map(e => `• ${e.name} at ${new Date(e.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`).join('\n')
        : `No events on ${parsed.date}.`
      await sendWhatsAppMessage(phone, `📅 *Events on ${parsed.date}:*\n${msg}`)
      break
    }

    case 'list_upcoming': {
      const { data: events } = await supabase.from('events').select('name, start_at')
        .eq('user_id', userId).gte('start_at', new Date().toISOString()).order('start_at').limit(5)
      const msg = events?.length
        ? events.map(e => {
            const d = new Date(e.start_at)
            return `• ${e.name} — ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
          }).join('\n')
        : 'No upcoming events.'
      await sendWhatsAppMessage(phone, `📅 *Upcoming events:*\n${msg}`)
      break
    }

    case 'create': {
      const { data: event, error } = await supabase.from('events').insert({
        user_id: userId,
        name: parsed.name,
        start_at: parsed.start_at.toISOString(),
        detail: parsed.detail ?? null,
        source: 'whatsapp',
      }).select().single()
      if (error || !event) { await sendWhatsAppMessage(phone, '❌ Failed to create event.'); break }
      await generateNotificationQueue(supabase, userId, event.id, event.start_at)
      const d = new Date(event.start_at)
      await sendWhatsAppMessage(phone, `✅ Created: *${event.name}*\n📅 ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`)
      break
    }

    case 'update': {
      const { data: events } = await supabase.from('events').select('id, name').eq('user_id', userId)
      const match = events?.find(e => e.name.toLowerCase() === parsed.name.toLowerCase())
      if (!match) { await sendWhatsAppMessage(phone, `❌ Event "${parsed.name}" not found.`); break }
      await supabase.from('events').update({ start_at: parsed.start_at.toISOString() }).eq('id', match.id)
      await sendWhatsAppMessage(phone, `✅ Updated: *${match.name}*`)
      break
    }

    case 'delete': {
      const { data: events } = await supabase.from('events').select('id, name').eq('user_id', userId)
      const match = events?.find(e => e.name.toLowerCase() === parsed.name.toLowerCase())
      if (!match) { await sendWhatsAppMessage(phone, `❌ Event "${parsed.name}" not found.`); break }
      await supabase.from('events').delete().eq('id', match.id)
      await sendWhatsAppMessage(phone, `✅ Deleted: *${match.name}*`)
      break
    }

    case 'remind': {
      const { data: events } = await supabase.from('events').select('id, name').eq('user_id', userId)
      const match = events?.find(e => e.name.toLowerCase() === parsed.name.toLowerCase())
      if (!match) { await sendWhatsAppMessage(phone, `❌ Event "${parsed.name}" not found.`); break }
      await supabase.from('notification_rules').insert({ user_id: userId, event_id: match.id, offset_minutes: parsed.offset_minutes })
      const mins = Math.abs(parsed.offset_minutes)
      const label = parsed.offset_minutes % 60 === 0 ? `${mins / 60}h` : `${mins} min`
      await sendWhatsAppMessage(phone, `✅ Reminder set: *${match.name}* — ${label} before`)
      break
    }

    case 'unknown': {
      await sendWhatsAppMessage(phone, "❓ I didn't understand that. Send *help* to see available commands.")
      break
    }
  }
}
```

- [ ] **Run — confirm PASS**
```bash
pnpm test app/api/webhooks/whatsapp/route.test.ts
```

- [ ] **Commit**
```bash
cd ../.. && git add apps/web/src/app/api/webhooks/
git commit -m "feat: whatsapp webhook with command execution and NLU fallback"
```

---

## Task 5: Notification Queue Generation

**Files:**
- Create: `apps/web/src/lib/notifications.ts`
- Create: `apps/web/src/lib/notifications.test.ts`
- Modify: `apps/web/src/app/api/events/route.ts`
- Modify: `apps/web/src/app/api/events/route.test.ts`

- [ ] **Write test — `apps/web/src/lib/notifications.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { generateNotificationQueue } from './notifications'

describe('generateNotificationQueue', () => {
  it('inserts queue rows for each notification rule', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockSB = {
      from: vi.fn((table: string) => {
        if (table === 'notification_rules') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [{ offset_minutes: -15 }, { offset_minutes: -60 }],
            error: null,
          }),
        }
        return { insert: mockInsert }
      }),
    } as never

    await generateNotificationQueue(mockSB, 'u1', 'e1', '2026-05-10T14:00:00.000Z')

    expect(mockInsert).toHaveBeenCalledOnce()
    const rows = mockInsert.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ event_id: 'e1', user_id: 'u1', channel: 'whatsapp' })
    const t1 = new Date('2026-05-10T14:00:00.000Z').getTime() - 15 * 60000
    const t2 = new Date('2026-05-10T14:00:00.000Z').getTime() - 60 * 60000
    expect(new Date(rows[0].scheduled_at).getTime()).toBe(t1)
    expect(new Date(rows[1].scheduled_at).getTime()).toBe(t2)
  })

  it('does nothing when user has no notification rules', async () => {
    const mockInsert = vi.fn()
    const mockSB = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: mockInsert,
      })),
    } as never
    await generateNotificationQueue(mockSB, 'u1', 'e1', '2026-05-10T14:00:00.000Z')
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Run — confirm FAIL**
```bash
cd apps/web && pnpm test lib/notifications.test.ts
```

- [ ] **Create `apps/web/src/lib/notifications.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@calendarrr/db'

export async function generateNotificationQueue(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  startAt: string,
): Promise<void> {
  const { data: rules } = await supabase
    .from('notification_rules')
    .select('offset_minutes')
    .eq('user_id', userId)
    .is('event_id', null)
  if (!rules?.length) return

  const startMs = new Date(startAt).getTime()
  await supabase.from('notification_queue').insert(
    rules.map(r => ({
      event_id: eventId,
      user_id: userId,
      scheduled_at: new Date(startMs + r.offset_minutes * 60000).toISOString(),
      channel: 'whatsapp' as const,
    }))
  )
}
```

- [ ] **Run — confirm PASS**
```bash
pnpm test lib/notifications.test.ts
```

- [ ] **Modify `apps/web/src/app/api/events/route.ts`**

Add import at the top (after existing imports):
```typescript
import { generateNotificationQueue } from '@/lib/notifications'
```

Replace the POST handler's return statement so the full handler reads:
```typescript
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createEventSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: event, error } = await supabase
    .from('events').insert({ ...parsed.data, user_id: user.id }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await generateNotificationQueue(supabase, user.id, event.id, event.start_at)
  return NextResponse.json({ event }, { status: 201 })
}
```

- [ ] **Add `@/lib/notifications` mock to `apps/web/src/app/api/events/route.test.ts`**

Add this line after the existing `vi.mock('@/lib/supabase/server', ...)` line:
```typescript
vi.mock('@/lib/notifications', () => ({ generateNotificationQueue: vi.fn().mockResolvedValue(undefined) }))
```

- [ ] **Run all tests**
```bash
pnpm test
# Expected: all pass
```

- [ ] **Commit**
```bash
cd ../.. && git add apps/web/src/lib/notifications.ts apps/web/src/lib/notifications.test.ts apps/web/src/app/api/events/
git commit -m "feat: notification queue generation on event creation"
```

---

## Task 6: Settings UI — Phone Verification

**Files:**
- Replace: `apps/web/src/app/(dashboard)/settings/page.tsx`

Add a WhatsApp phone verification card above the existing notification offsets card. Preserve all existing notification offset logic.

- [ ] **Replace `apps/web/src/app/(dashboard)/settings/page.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SettingsPage() {
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'sending' | 'verifying' | 'verified' | 'error'>('idle')
  const [phoneError, setPhoneError] = useState('')

  async function sendOtp() {
    setPhoneStatus('sending')
    setPhoneError('')
    const res = await fetch('/api/settings/whatsapp/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    if (res.ok) { setOtpSent(true); setPhoneStatus('idle') }
    else { setPhoneError('Failed to send code. Check your phone number.'); setPhoneStatus('error') }
  }

  async function verifyOtp() {
    setPhoneStatus('verifying')
    setPhoneError('')
    const res = await fetch('/api/settings/whatsapp/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp }),
    })
    if (res.ok) { setPhoneStatus('verified') }
    else { setPhoneError('Invalid or expired code. Try again.'); setPhoneStatus('error') }
  }

  const [offsets, setOffsets] = useState<number[]>([-15, -60])
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/settings/notifications').then(r => r.json()).then(d => {
      if (d.rules?.length) setOffsets(d.rules.map((r: { offset_minutes: number }) => r.offset_minutes))
    }).catch(console.error)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  async function save() {
    await fetch('/api/settings/notifications', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offsets }),
    })
    setSaved(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp notifications</CardTitle>
          <CardDescription>Link your WhatsApp number to receive reminders and use the bot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {phoneStatus === 'verified' ? (
            <p className="text-sm text-green-600 font-medium">✓ {phone} verified — WhatsApp bot is active</p>
          ) : (
            <>
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" type="tel" placeholder="+1234567890" value={phone}
                    onChange={e => setPhone(e.target.value)} disabled={otpSent} />
                </div>
                {!otpSent && (
                  <Button onClick={sendOtp} disabled={!phone || phoneStatus === 'sending'}>
                    {phoneStatus === 'sending' ? 'Sending…' : 'Send code'}
                  </Button>
                )}
              </div>
              {otpSent && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="otp">Verification code</Label>
                    <Input id="otp" placeholder="123456" value={otp}
                      onChange={e => setOtp(e.target.value)} maxLength={6} />
                  </div>
                  <Button onClick={verifyOtp} disabled={otp.length !== 6 || phoneStatus === 'verifying'}>
                    {phoneStatus === 'verifying' ? 'Verifying…' : 'Verify'}
                  </Button>
                </div>
              )}
              {phoneStatus === 'error' && <p className="text-sm text-destructive">{phoneError}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default notifications</CardTitle>
          <CardDescription>Minutes before each event for WhatsApp reminders (negative = before).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {offsets.map((offset, i) => (
            <div key={`offset-${i}`} className="flex items-center gap-2">
              <Label className="w-24 shrink-0">Reminder {i + 1}</Label>
              <Input type="number" value={offset} className="w-28"
                onChange={e => setOffsets(prev => prev.map((v, j) => j === i ? Number(e.target.value) : v))} />
              <span className="text-sm text-muted-foreground">min before</span>
              {offsets.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setOffsets(prev => prev.filter((_, j) => j !== i))}>Remove</Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setOffsets(p => [...p, -30])}>+ Add reminder</Button>
          <Button onClick={save} className="w-full">{saved ? 'Saved!' : 'Save settings'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Run all tests**
```bash
cd apps/web && pnpm test
# Expected: all pass
```

- [ ] **Commit**
```bash
cd ../.. && git add apps/web/src/app/(dashboard)/settings/page.tsx
git commit -m "feat: whatsapp phone verification UI in settings"
```

---

## Task 7: Supabase Edge Function — Notification Dispatcher

**Files:**
- Create: `supabase/functions/notify/index.ts`

This runs in Deno (not Node.js). Uses ESM imports from `esm.sh`. No npm packages or `node:` imports.

- [ ] **Create `supabase/functions/notify/index.ts`**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function sendMessage(to: string, text: string): Promise<void> {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
  const token = Deno.env.get('WHATSAPP_TOKEN')!
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })
  if (!res.ok) throw new Error(`WhatsApp error ${res.status}`)
}

function formatMessage(name: string, startAt: string, detail: string | null): string {
  const d = new Date(startAt)
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return [`⏰ Reminder: ${name}`, `📅 ${dateStr} at ${timeStr}`, detail ? `📝 ${detail}` : null]
    .filter(Boolean).join('\n')
}

Deno.serve(async () => {
  const { data: pending, error } = await supabase
    .from('notification_queue')
    .select('id, user_id, retry_count, events(name, detail, start_at)')
    .lte('scheduled_at', new Date().toISOString())
    .is('sent_at', null)
    .is('failed_at', null)
    .lt('retry_count', 3)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!pending?.length) return new Response(JSON.stringify({ processed: 0, sent: 0 }))

  let sent = 0
  for (const notif of pending) {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('phone_number')
      .eq('user_id', notif.user_id)
      .not('verified_at', 'is', null)
      .single()

    if (!session) continue

    const event = notif.events as { name: string; detail: string | null; start_at: string } | null
    if (!event) continue

    try {
      await sendMessage(session.phone_number, formatMessage(event.name, event.start_at, event.detail))
      await supabase.from('notification_queue').update({ sent_at: new Date().toISOString() }).eq('id', notif.id)
      sent++
    } catch {
      const newCount = notif.retry_count + 1
      await supabase.from('notification_queue').update({
        retry_count: newCount,
        failed_at: newCount >= 3 ? new Date().toISOString() : null,
      }).eq('id', notif.id)
    }
  }

  return new Response(JSON.stringify({ processed: pending.length, sent }))
})
```

- [ ] **Deploy the Edge Function**
```bash
pnpm supabase functions deploy notify
# Expected: "Function notify deployed successfully"
```

- [ ] **Set Edge Function secrets**
```bash
pnpm supabase secrets set WHATSAPP_TOKEN=<your-token> WHATSAPP_PHONE_NUMBER_ID=<your-phone-number-id>
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
```

- [ ] **Enable 1-minute cron schedule**

Supabase dashboard → Edge Functions → `notify` → Schedules → Add schedule:
- Cron expression: `* * * * *`

- [ ] **Smoke test**
```bash
pnpm supabase functions invoke notify
# Expected: { "processed": 0, "sent": 0 }
```

- [ ] **Commit**
```bash
git add supabase/functions/
git commit -m "feat: supabase edge function notification dispatcher"
```

---

## Phase 2 Complete ✓

**Manual setup after deploying to Vercel:**

1. **Add env vars to Vercel** — Settings → Environment Variables:
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `ANTHROPIC_API_KEY`

2. **Register webhook with Meta** — Meta Business Manager → WhatsApp → Configuration:
   - Webhook URL: `https://calendarrr-ten.vercel.app/api/webhooks/whatsapp`
   - Verify token: value of `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to: `messages`

3. **Verify phone in app** — Settings page → enter phone number → complete OTP flow.

**Phase 3 plan** (Email Sync: Gmail, Outlook, IMAP) is written before Phase 3 starts.
