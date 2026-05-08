import type { CalendarEvent } from '@calendarrr/types'
import { formatEventTime } from '@calendarrr/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export function EventCard({ event }: { event: CalendarEvent }) {
  return (
    <Link href={`/events/${event.id}/edit`}>
      <Card className="hover:bg-accent transition-colors cursor-pointer">
        <CardContent className="py-3 px-4 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{event.name}</p>
            {event.detail && <p className="text-sm text-muted-foreground truncate">{event.detail}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm text-muted-foreground">{formatEventTime(event.start_at)}</span>
            <Badge variant="outline">{event.source}</Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
