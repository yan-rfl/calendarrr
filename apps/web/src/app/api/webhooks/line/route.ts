import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@calendarrr/db'
import { parseLineMessage, type ParseResult } from '@calendarrr/utils'
import { sendLineMessage, verifyLineSignature } from '@/lib/line'
import { generateNotificationQueue } from '@/lib/notifications'
import Anthropic from '@anthropic-ai/sdk'

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-line-signature') ?? ''

  if (process.env.LINE_CHANNEL_SECRET && !verifyLineSignature(rawBody, signature)) {
    return new Response('Forbidden', { status: 403 })
  }

  const body = JSON.parse(rawBody)
  const events: unknown[] = body?.events ?? []

  const supabase = serviceClient()

  for (const event of events) {
    const e = event as Record<string, unknown>
    if (e.type === 'follow') {
      const lineUserId = (e.source as Record<string, string>).userId
      await sendLineMessage(lineUserId,
        '👋 Welcome to CalendaRRR!\n\nTo link your account, open the Settings page in the app and send the 6-digit code shown there.'
      )
      continue
    }

    if (e.type !== 'message') continue
    const msg = e.message as Record<string, string>
    if (msg?.type !== 'text') continue

    const lineUserId = (e.source as Record<string, string>).userId
    const text = msg.text.trim()

    // Link code flow
    if (/^\d{6}$/.test(text)) {
      await handleLinkCode(supabase, lineUserId, text)
      continue
    }

    // Command flow
    const { data: session } = await supabase
      .from('line_sessions')
      .select('user_id')
      .eq('line_user_id', lineUserId)
      .not('verified_at', 'is', null)
      .single()

    if (!session) {
      await sendLineMessage(lineUserId, '⚠️ Your LINE account is not linked. Open Settings in CalendaRRR and send the 6-digit code shown.')
      continue
    }

    let parsed = parseLineMessage(text)
    if (parsed.type === 'unknown') parsed = await nlpFallback(text)

    await executeCommand(supabase, session.user_id, lineUserId, parsed)
  }

  return NextResponse.json({ ok: true })
}

async function handleLinkCode(supabase: ReturnType<typeof serviceClient>, lineUserId: string, code: string): Promise<void> {
  const now = new Date().toISOString()
  const { data: session } = await supabase
    .from('line_sessions')
    .select('user_id, pending_link_code_expires_at')
    .eq('pending_link_code', code)
    .gt('pending_link_code_expires_at', now)
    .single()

  if (!session) {
    await sendLineMessage(lineUserId, '❌ Invalid or expired code. Go to Settings in CalendaRRR to get a new one.')
    return
  }

  await supabase.from('line_sessions').update({
    line_user_id: lineUserId,
    verified_at: now,
    pending_link_code: null,
    pending_link_code_expires_at: null,
  }).eq('user_id', session.user_id)

  await sendLineMessage(lineUserId, '✅ Account linked! Send *help* to see available commands.')
}

async function nlpFallback(text: string): Promise<ParseResult> {
  try {
    const client = new Anthropic()
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Convert this calendar request to a structured command. Reply with ONLY one of these exact formats (no explanation):
- Name_YYYY-MM-DD HH:MM
- Name_YYYY-MM-DD HH:MM_Detail
- delete Name
- update Name to YYYY-MM-DD HH:MM
- today
- upcoming
- help

Message: "${text}"
Today's date: ${new Date().toISOString().slice(0, 10)}`,
      }],
    })
    const reply = (msg.content[0] as { text: string }).text.trim()
    return parseLineMessage(reply)
  } catch {
    return { type: 'unknown', raw: text }
  }
}

type SB = ReturnType<typeof serviceClient>

async function executeCommand(supabase: SB, userId: string, lineUserId: string, parsed: ParseResult): Promise<void> {
  switch (parsed.type) {
    case 'help': {
      await sendLineMessage(lineUserId, [
        '📅 CalendaRRR Commands',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        '📝 CREATE EVENT',
        'Name_2026-05-10 13:00',
        'Name_2026-05-10 1:00 PM',
        'Name_2026-05-10 1 PM',
        'Name_2026-05-10 13:00_Detail',
        'Name_Today at 2:30 PM',
        'Name_Tomorrow at 9:00 AM',
        'Name_In 30 minutes',
        'Name_In 2 hours',
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '📋 VIEW EVENTS',
        'today',
        'upcoming',
        'list 2026-05-10',
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '✏️ MANAGE EVENTS',
        'update Name to 2026-05-10 13:00',
        'delete Name',
        'remind Name 30 min before',
        'remind Name 1 hour before',
      ].join('\n'))
      break
    }

    case 'list_today': {
      const today = new Date()
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
      const { data: events } = await supabase.from('events').select('name, start_at')
        .eq('user_id', userId).gte('start_at', from).lt('start_at', to).order('start_at')
      const msg = events?.length
        ? events.map(e => `• ${e.name} at ${new Date(e.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`).join('\n')
        : 'No events today.'
      await sendLineMessage(lineUserId, `📅 Today's events:\n${msg}`)
      break
    }

    case 'list_date': {
      const from = new Date(parsed.date + 'T00:00:00').toISOString()
      const to = new Date(parsed.date + 'T23:59:59').toISOString()
      const { data: events } = await supabase.from('events').select('name, start_at')
        .eq('user_id', userId).gte('start_at', from).lte('start_at', to).order('start_at')
      const msg = events?.length
        ? events.map(e => `• ${e.name} at ${new Date(e.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`).join('\n')
        : `No events on ${parsed.date}.`
      await sendLineMessage(lineUserId, `📅 Events on ${parsed.date}:\n${msg}`)
      break
    }

    case 'list_upcoming': {
      const { data: events } = await supabase.from('events').select('name, start_at')
        .eq('user_id', userId).gte('start_at', new Date().toISOString()).order('start_at').limit(5)
      const msg = events?.length
        ? events.map(e => {
            const d = new Date(e.start_at)
            return `• ${e.name} — ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
          }).join('\n')
        : 'No upcoming events.'
      await sendLineMessage(lineUserId, `📅 Upcoming events:\n${msg}`)
      break
    }

    case 'create': {
      const { data: event, error } = await supabase.from('events').insert({
        user_id: userId,
        name: parsed.name,
        start_at: parsed.start_at.toISOString(),
        detail: parsed.detail ?? null,
        source: 'line',
      }).select().single()
      if (error || !event) { await sendLineMessage(lineUserId, '❌ Failed to create event.'); break }
      await generateNotificationQueue(supabase, userId, event.id, event.start_at)
      const d = new Date(event.start_at)
      await sendLineMessage(lineUserId, `✅ Created: ${event.name}\n📅 ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`)
      break
    }

    case 'update': {
      const { data: events } = await supabase.from('events').select('id, name').eq('user_id', userId)
      const match = events?.find(e => e.name.toLowerCase() === parsed.name.toLowerCase())
      if (!match) { await sendLineMessage(lineUserId, `❌ Event "${parsed.name}" not found.`); break }
      await supabase.from('events').update({ start_at: parsed.start_at.toISOString() }).eq('id', match.id)
      await sendLineMessage(lineUserId, `✅ Updated: ${match.name}`)
      break
    }

    case 'delete': {
      const { data: events } = await supabase.from('events').select('id, name').eq('user_id', userId)
      const match = events?.find(e => e.name.toLowerCase() === parsed.name.toLowerCase())
      if (!match) { await sendLineMessage(lineUserId, `❌ Event "${parsed.name}" not found.`); break }
      await supabase.from('events').delete().eq('id', match.id)
      await sendLineMessage(lineUserId, `✅ Deleted: ${match.name}`)
      break
    }

    case 'remind': {
      const { data: events } = await supabase.from('events').select('id, name').eq('user_id', userId)
      const match = events?.find(e => e.name.toLowerCase() === parsed.name.toLowerCase())
      if (!match) { await sendLineMessage(lineUserId, `❌ Event "${parsed.name}" not found.`); break }
      await supabase.from('notification_rules').insert({ user_id: userId, event_id: match.id, offset_minutes: parsed.offset_minutes })
      const mins = Math.abs(parsed.offset_minutes)
      const label = parsed.offset_minutes % 60 === 0 ? `${mins / 60}h` : `${mins} min`
      await sendLineMessage(lineUserId, `✅ Reminder set: ${match.name} — ${label} before`)
      break
    }

    case 'unknown': {
      await sendLineMessage(lineUserId, "❓ I didn't understand that. Send 'help' to see available commands.")
      break
    }
  }
}
