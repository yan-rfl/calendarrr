import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { updateEventSchema } from '@/lib/validations/event'

type P = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: P) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data: event, error } = await supabase
    .from('events').select('*').eq('id', id).eq('user_id', user.id).single()
  if (error || !event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ event })
}

export async function PATCH(request: Request, { params }: P) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = updateEventSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { id } = await params
  const { data: event, error } = await supabase
    .from('events').update(parsed.data).eq('id', id).eq('user_id', user.id).select().single()
  if (error || !event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ event })
}

export async function DELETE(_req: Request, { params }: P) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { error } = await supabase.from('events').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
