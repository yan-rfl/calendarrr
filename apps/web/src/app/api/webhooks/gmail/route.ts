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

    // If Pub/Sub delivers out of order, query from whichever historyId is earlier
    const queryHistoryId = Number(storedHistoryId) <= Number(newHistoryId)
      ? storedHistoryId
      : String(Number(newHistoryId) - 1)

    let accessToken = conn.access_token!
    let messageIds: string[]
    try {
      messageIds = await getGmailHistory(accessToken, queryHistoryId)
    } catch (err) {
      const is401 = err instanceof Error && err.message.includes('401')
      if (!is401 || !conn.refresh_token) return new Response('ok', { status: 200 })
      accessToken = await refreshAccessToken(conn.refresh_token)
      await supabase.from('email_connections').update({ access_token: accessToken })
        .eq('user_id', conn.user_id).eq('provider', 'gmail')
      messageIds = await getGmailHistory(accessToken, queryHistoryId)
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

    // Always advance to the higher historyId — never go backwards
    const newMeta: Record<string, string> = { ...meta, historyId: String(Math.max(Number(storedHistoryId), Number(newHistoryId))) }

    if (meta.watchExpiry && new Date(meta.watchExpiry).getTime() - Date.now() < 2 * 24 * 3600 * 1000) {
      const renewed = await registerGmailWatch(accessToken).catch(() => null)
      if (renewed) { newMeta.watchExpiry = renewed.expiry }
    }

    await supabase.from('email_connections')
      .update({ sync_metadata: newMeta, last_synced_at: new Date().toISOString() })
      .eq('user_id', conn.user_id).eq('provider', 'gmail')

  } catch { /* always 200 to prevent Pub/Sub infinite retries */ }

  return new Response('ok', { status: 200 })
}
