'use client'
import { useState } from 'react'
import type { CalendarEvent } from '@calendarrr/types'
import { EventCard } from './EventCard'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function startOfWeek(d: Date) {
  const r = new Date(d)
  r.setDate(r.getDate() - r.getDay())
  r.setHours(0, 0, 0, 0)
  return r
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

export function CalendarView({ events }: { events: CalendarEvent[] }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const forDay = (day: Date) => events.filter(e => {
    const d = new Date(e.start_at)
    return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate()
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Week of {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="space-y-3">
        {days.map(day => {
          const dayEvents = forDay(day)
          const isToday = day.toDateString() === new Date().toDateString()
          return (
            <div key={day.toISOString()}>
              <h3 className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                {day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                {isToday && ' • Today'}
              </h3>
              {dayEvents.length > 0
                ? <div className="space-y-1">{dayEvents.map(e => <EventCard key={e.id} event={e} />)}</div>
                : <p className="text-xs text-muted-foreground pl-1">No events</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
