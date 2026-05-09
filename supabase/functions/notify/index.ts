import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function sendMessage(lineUserId: string, text: string): Promise<void> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  })
  if (!res.ok) throw new Error(`LINE error ${res.status}`)
}

function formatMessage(name: string, startAt: string, detail: string | null, timezone: string): string {
  const d = new Date(startAt)
  const tz = { timeZone: timezone }
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...tz })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, ...tz })
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
      .from('line_sessions')
      .select('line_user_id, timezone')
      .eq('user_id', notif.user_id)
      .not('verified_at', 'is', null)
      .single()

    if (!session?.line_user_id) continue

    const event = notif.events as { name: string; detail: string | null; start_at: string } | null
    if (!event) continue

    const timezone = session.timezone ?? 'UTC'
    try {
      await sendMessage(session.line_user_id, formatMessage(event.name, event.start_at, event.detail, timezone))
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
