import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: connections, error } = await supabase
    .from('email_connections')
    .select('provider, imap_user')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  const gmail = connections?.find(c => c.provider === 'gmail' && c.imap_user != null)

  return NextResponse.json({
    gmail: gmail
      ? { connected: true, email: gmail.imap_user }
      : { connected: false },
  })
}
