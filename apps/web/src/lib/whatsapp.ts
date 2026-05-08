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
