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

  const { error: deleteError } = await supabase
    .from('email_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'gmail')

  if (deleteError) return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
