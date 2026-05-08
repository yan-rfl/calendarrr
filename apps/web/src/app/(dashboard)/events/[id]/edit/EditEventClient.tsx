'use client'
import { useRouter } from 'next/navigation'
import type { CalendarEvent } from '@calendarrr/types'
import { EventForm } from '@/components/events/EventForm'
import { Button } from '@/components/ui/button'

export function EditEventClient({ event }: { event: CalendarEvent }) {
  const router = useRouter()
  async function handleDelete() {
    const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
    if (!res.ok) {
      console.error('Failed to delete event', res.status)
      return
    }
    router.push('/'); router.refresh()
  }
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <EventForm title="Edit Event" event={event} onSubmit={async (data) => {
        const res = await fetch(`/api/events/${event.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) {
          console.error('Failed to update event', res.status)
          throw new Error(`Failed to update event: ${res.status}`)
        }
      }} />
      <div className="max-w-lg mx-auto">
        <Button variant="destructive" className="w-full" onClick={handleDelete}>Delete event</Button>
      </div>
    </div>
  )
}
