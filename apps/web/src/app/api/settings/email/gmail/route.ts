import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { stopGmailWatch } from '@/lib/gmail'

export async function DELETE() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conn } = await supabase
    .from('email_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('provider', 'gmail')
    .single()

  if (conn?.access_token) {
    try { await stopGmailWatch(conn.access_token) } catch { /* best-effort */ }
  }

  await supabase
    .from('email_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'gmail')

  return NextResponse.json({ ok: true })
}
