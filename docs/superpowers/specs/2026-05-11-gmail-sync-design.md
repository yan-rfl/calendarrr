# Gmail Sync — Design Spec

**Date:** 2026-05-11
**Status:** Approved

---

## Goal

Allow users to connect their Gmail account so that incoming calendar invite emails (ICS attachments) are automatically imported as events.

## Architecture

Four distinct pieces:

1. **OAuth flow** — Settings UI "Connect Gmail" button → API routes handle redirect + callback, store tokens, register Gmail push watch
2. **Webhook receiver** — `/api/webhooks/gmail` receives Pub/Sub push notifications, fetches new emails, parses ICS attachments, creates events
3. **ICS parser** — Shared utility in `packages/utils` extracts name, start/end times, and detail from a calendar attachment
4. **Self-renewing watch** — Gmail `watch()` expires every 7 days; the webhook renews it automatically when within 2 days of expiry

Outlook is out of scope for this phase (Microsoft account setup blocked). The `email_connections` table schema already supports it for future addition.

---

## Database

No new tables. One migration adds a `sync_metadata JSONB` column to `email_connections` to store Gmail-specific state:

```json
{ "historyId": "12345", "watchExpiry": "2026-05-18T10:00:00.000Z" }
```

The existing columns (`provider`, `access_token`, `refresh_token`, `last_synced_at`) are used as-is.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_PUBSUB_TOPIC` | Full topic name, e.g. `projects/my-project/topics/gmail-push` |

---

## API Routes

### `GET /api/settings/email/gmail/connect`
Redirects the authenticated user to Google OAuth consent screen.
- Scopes: `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/gmail.readonly`
- Sets a short-lived `oauth_state` cookie containing the user's Supabase `user_id` (verified in the callback to prevent CSRF)

### `GET /api/settings/email/gmail/callback`
Handles the OAuth redirect from Google.
1. Exchanges `code` for `access_token` + `refresh_token`
2. Fetches the Gmail address via userinfo endpoint
3. Upserts into `email_connections` (`provider: 'gmail'`)
4. Calls Gmail `watch()` API → stores `historyId` + expiry in `sync_metadata`
5. Redirects to `/settings?connected=gmail`

### `GET /api/settings/email/status`
Returns connection state for the authenticated user.
```json
{ "gmail": { "connected": true, "email": "user@gmail.com" } }
```

### `DELETE /api/settings/email/gmail`
Disconnects Gmail: calls Gmail `stop()` to unregister the watch, deletes the `email_connections` row.

### `POST /api/webhooks/gmail`
Receives Pub/Sub push notifications (no auth middleware — public endpoint).
1. Decodes the base64 Pub/Sub message to get `emailAddress` + `historyId`
2. Looks up `email_connections` by Gmail address
3. Refreshes access token if expired
4. Calls Gmail History API from stored `historyId` to new `historyId` to get new message IDs
5. For each new message: fetches full message, looks for `text/calendar` MIME part or `.ics` attachment
6. Parses ICS → checks `external_id` deduplication → inserts into `events` (source: `'gmail'`) → logs to `event_sync_log` → calls `generateNotificationQueue`
7. Updates `historyId` in `sync_metadata` and `last_synced_at`
8. If `watchExpiry` is within 2 days, calls `watch()` again to renew

---

## ICS Parser (`packages/utils/src/ics-parser.ts`)

Parses a raw ICS string and returns a structured object:

```typescript
export type ICSEvent = {
  name: string
  start_at: Date
  end_at?: Date
  detail?: string
}

export function parseICS(raw: string): ICSEvent | null
```

Extracts:
- `SUMMARY` → `name`
- `DTSTART` → `start_at` (handles `20260510T140000Z`, `20260510T140000`, `20260510`)
- `DTEND` → `end_at` (optional)
- `DESCRIPTION` → `detail` (optional, strips `\n` escape sequences)

Returns `null` if `SUMMARY` or `DTSTART` is missing.

---

## Settings UI

New "Email Sync" card in `apps/web/src/app/(dashboard)/settings/page.tsx`, below the LINE card.

**Disconnected state:**
- "Connect Gmail" button linking to `/api/settings/email/gmail/connect`

**Connected state:**
- Green checkmark + connected Gmail address
- "Disconnect" button calling `DELETE /api/settings/email/gmail`

**On mount:** fetches `GET /api/settings/email/status`. After OAuth callback, the `/settings?connected=gmail` query param triggers a re-fetch to show connected state.

---

## Token Refresh

Before any Gmail API call, check if `access_token` is expired by attempting the call and catching a 401. On 401, use `refresh_token` to get a new `access_token` from Google's token endpoint, update the DB row, and retry.

---

## Deduplication

Before inserting an event, check if an `events` row already exists with `external_id = <gmailMessageId> AND user_id = <userId>`. Skip if found. This prevents duplicate imports if the webhook fires more than once for the same message.

---

## Error Handling

- Pub/Sub push: always return `200 OK` even on errors (otherwise Pub/Sub retries indefinitely). Log failures to `event_sync_log` with `action: 'failed'`.
- Token refresh failure: mark `email_connections` row with `last_synced_at = null` so it can be detected; do not crash the webhook.
- Invalid/empty ICS: skip silently, log with `action: 'skipped'`.

---

## Testing

- `ics-parser.ts`: unit tests for all DTSTART formats, missing fields, multi-event ICS (take first VEVENT)
- `gmail/callback/route.ts`: mock Google token exchange + watch API
- `gmail/status/route.ts`: connected vs disconnected state
- `webhooks/gmail/route.ts`: Pub/Sub payload decoding, ICS extraction, deduplication, watch renewal logic
