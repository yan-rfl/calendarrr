import crypto from 'crypto'

const LINE_API = 'https://api.line.me/v2/bot/message/push'

export async function sendLineMessage(lineUserId: string, text: string): Promise<void> {
  const res = await fetch(LINE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LINE API error ${res.status}: ${err}`)
  }
}

export function formatNotificationMessage(name: string, startAt: string, detail?: string | null): string {
  const d = new Date(startAt)
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return [`⏰ Reminder: ${name}`, `📅 ${dateStr} at ${timeStr}`, detail ? `📝 ${detail}` : null]
    .filter(Boolean).join('\n')
}

export function verifyLineSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET!
  const hash = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64')
  return hash === signature
}
