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
