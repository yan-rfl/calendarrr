import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { EditEventClient } from './EditEventClient'
import type { CalendarEvent } from '@calendarrr/types'

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: event } = await supabase.from('events').select('*').eq('id', id).eq('user_id', user!.id).single()
  if (!event) notFound()
  return <EditEventClient event={event as CalendarEvent} />
}
