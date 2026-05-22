'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'react-qr-code'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type LineStatus =
  | { state: 'loading' }
  | { state: 'connected'; displayName: string | null }
  | { state: 'unlinked'; code: string; addFriendUrl: string }
  | { state: 'error' }

type GmailStatus =
  | { state: 'loading' }
  | { state: 'connected'; email: string }
  | { state: 'disconnected' }
  | { state: 'error' }

export default function SettingsPage() {
  const [lineStatus, setLineStatus] = useState<LineStatus>({ state: 'loading' })

  const fetchLineStatus = useCallback(async () => {
    setLineStatus({ state: 'loading' })
    try {
      const res = await fetch('/api/settings/line/connect')
      const data = await res.json()
      if (data.connected) {
        setLineStatus({ state: 'connected', displayName: data.displayName })
      } else {
        setLineStatus({ state: 'unlinked', code: data.code, addFriendUrl: data.addFriendUrl })
      }
    } catch {
      setLineStatus({ state: 'error' })
    }
  }, [])

  useEffect(() => { fetchLineStatus() }, [fetchLineStatus])

  const [gmailStatus, setGmailStatus] = useState<GmailStatus>({ state: 'loading' })

  const fetchGmailStatus = useCallback(async () => {
    setGmailStatus({ state: 'loading' })
    try {
      const res = await fetch('/api/settings/email/status')
      const data = await res.json()
      if (data.gmail?.connected) {
        setGmailStatus({ state: 'connected', email: data.gmail.email })
      } else {
        setGmailStatus({ state: 'disconnected' })
      }
    } catch {
      setGmailStatus({ state: 'error' })
    }
  }, [])

  useEffect(() => {
    fetchGmailStatus()
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'gmail') {
      window.history.replaceState({}, '', '/settings')
    }
  }, [fetchGmailStatus])

  async function disconnectGmail() {
    await fetch('/api/settings/email/gmail', { method: 'DELETE' })
    fetchGmailStatus()
  }

  const [offsets, setOffsets] = useState<number[]>([-15, -60])
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/settings/notifications').then(r => r.json()).then(d => {
      if (d.rules?.length) setOffsets(d.rules.map((r: { offset_minutes: number }) => r.offset_minutes))
    }).catch(console.error)
    return () => { if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current) }
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
          <CardTitle>LINE Bot</CardTitle>
          <CardDescription>Connect your LINE account to receive reminders and use the bot.</CardDescription>
        </CardHeader>
        <CardContent>
          {lineStatus.state === 'loading' && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {lineStatus.state === 'connected' && (
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-medium">✓ Connected</span>
              {lineStatus.displayName && (
                <span className="text-sm text-muted-foreground">as {lineStatus.displayName}</span>
              )}
            </div>
          )}
          {lineStatus.state === 'unlinked' && (
            <div className="space-y-4">
              <div className="flex gap-6 items-start">
                <div className="shrink-0 p-2 bg-white rounded border">
                  <QRCode value={lineStatus.addFriendUrl} size={128} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">1. Scan to add the bot on LINE</p>
                  <p className="text-sm font-medium">2. Send this code in the chat:</p>
                  <div className="font-mono text-2xl tracking-widest font-bold">{lineStatus.code}</div>
                  <p className="text-xs text-muted-foreground">Code expires in 15 minutes.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={fetchLineStatus}>
                Refresh status
              </Button>
            </div>
          )}
          {lineStatus.state === 'error' && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">Failed to load LINE status.</p>
              <Button variant="outline" size="sm" onClick={fetchLineStatus}>Retry</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Sync</CardTitle>
          <CardDescription>Connect Gmail to auto-import calendar invites (ICS attachments).</CardDescription>
        </CardHeader>
        <CardContent>
          {gmailStatus.state === 'loading' && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {gmailStatus.state === 'connected' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium">✓ Connected</span>
                <span className="text-sm text-muted-foreground">{gmailStatus.email}</span>
              </div>
              <Button variant="outline" size="sm" onClick={disconnectGmail}>Disconnect</Button>
            </div>
          )}
          {gmailStatus.state === 'disconnected' && (
            <a href="/api/settings/email/gmail/connect">
              <Button variant="outline">Connect Gmail</Button>
            </a>
          )}
          {gmailStatus.state === 'error' && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">Failed to load Gmail status.</p>
              <Button variant="outline" size="sm" onClick={fetchGmailStatus}>Retry</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default notifications</CardTitle>
          <CardDescription>Minutes before each event for LINE reminders (negative = before).</CardDescription>
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
