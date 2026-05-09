import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({ offsets: z.array(z.number().int()).min(1).max(10) })

export async function GET(_req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: rules, error } = await supabase
    .from('notification_rules').select('*').eq('user_id', user.id).is('event_id', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: rules ?? [] })
}

export async function PUT(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await supabase.from('notification_rules').delete().eq('user_id', user.id).is('event_id', null)
  const { data: rules, error } = await supabase
    .from('notification_rules')
    .insert(parsed.data.offsets.map(offset => ({ user_id: user.id, event_id: null, offset_minutes: offset })))
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules })
}
