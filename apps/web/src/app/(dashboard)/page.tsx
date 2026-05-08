import { createServerClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/calendar/CalendarView'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { CalendarEvent } from '@calendarrr/types'

export default async function DashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString()
  const { data: events } = await supabase
    .from('events').select('*').eq('user_id', user!.id)
    .gte('start_at', from).lte('start_at', to).order('start_at', { ascending: true })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">CalendaRRR</h1>
        <Link href="/events/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" />New event</Button></Link>
      </div>
      <CalendarView events={(events ?? []) as CalendarEvent[]} />
    </div>
  )
}
