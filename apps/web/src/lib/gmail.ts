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
    for (const msg of ((record.messagesAdded ?? []) as Record<string, unknown>[])) {
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
