'use client'
import { EventForm } from '@/components/events/EventForm'

export default function NewEventPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <EventForm title="New Event" onSubmit={async (data) => {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, source: 'manual' }),
        })
        if (!res.ok) {
          console.error('Failed to create event', res.status)
          throw new Error(`Failed to create event: ${res.status}`)
        }
      }} />
    </div>
  )
}
