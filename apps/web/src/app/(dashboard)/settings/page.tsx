'use client'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SettingsPage() {
  const [offsets, setOffsets] = useState<number[]>([-15, -60])
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/settings/notifications').then(r => r.json()).then(d => {
      if (d.rules?.length) setOffsets(d.rules.map((r: { offset_minutes: number }) => r.offset_minutes))
    }).catch(console.error)
  }, [])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current)
    }
  }, [])

  async function save() {
    await fetch('/api/settings/notifications', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offsets }),
    })
    setSaved(true)
    if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Default notifications</CardTitle>
          <CardDescription>Minutes before each event for WhatsApp reminders (negative = before).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {offsets.map((offset, i) => (
            <div key={`offset-${i}`} className="flex items-center gap-2">
              <Label className="w-24 shrink-0">Reminder {i + 1}</Label>
              <Input type="number" value={offset} className="w-28"
                onChange={e => setOffsets(prev => prev.map((v, j) => j === i ? Number(e.target.value) : v))} />
              <span className="text-sm text-muted-foreground">min before</span>
              {offsets.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setOffsets(prev => prev.filter((_, j) => j !== i))}>Remove</Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setOffsets(p => [...p, -30])}>+ Add reminder</Button>
          <Button onClick={save} className="w-full">{saved ? 'Saved!' : 'Save settings'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
