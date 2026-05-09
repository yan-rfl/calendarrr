'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CalendarEvent } from '@calendarrr/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type SubmitData = { name: string; detail: string; start_at: string; end_at: string }

function toLocalInputValue(utcIso: string): string {
  const d = new Date(utcIso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function localInputToISO(localStr: string): string {
  const [date, time] = localStr.split('T')
  const [y, mo, day] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, mo - 1, day, h, min).toISOString()
}

export function EventForm({ event, onSubmit, title }: {
  event?: CalendarEvent
  onSubmit: (d: SubmitData) => Promise<void>
  title: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(event?.name ?? '')
  const [detail, setDetail] = useState(event?.detail ?? '')
  const [startAt, setStartAt] = useState(event?.start_at ? toLocalInputValue(event.start_at) : '')
  const [endAt, setEndAt] = useState(event?.end_at ? toLocalInputValue(event.end_at) : '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit({ name, detail: detail ?? '', start_at: localInputToISO(startAt), end_at: endAt ? localInputToISO(endAt) : '' })
      router.push('/')
      router.refresh()
    } finally { setLoading(false) }
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Event name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="start">Date &amp; time</Label>
            <Input id="start" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end">End time (optional)</Label>
            <Input id="end" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="detail">Details (optional)</Label>
            <Textarea id="detail" value={detail ?? ''} onChange={e => setDetail(e.target.value)} rows={3} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading} className="flex-1">{loading ? 'Saving…' : 'Save event'}</Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
