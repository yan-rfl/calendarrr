import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createEventSchema } from '@/lib/validations/event'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  let query = supabase.from('events').select('*').eq('user_id', user.id).order('start_at', { ascending: true })
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from) query = query.gte('start_at', from)
  if (to) query = query.lte('start_at', to)

  const { data: events, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createEventSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: event, error } = await supabase
    .from('events').insert({ ...parsed.data, user_id: user.id }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event }, { status: 201 })
}
