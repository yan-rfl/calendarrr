import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabase
    .from('line_sessions')
    .select('line_user_id, display_name, verified_at')
    .eq('user_id', user.id)
    .single()

  if (existing?.verified_at) {
    return NextResponse.json({ connected: true, displayName: existing.display_name })
  }

  const code = generateCode()
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  await supabase.from('line_sessions').upsert(
    { user_id: user.id, pending_link_code: code, pending_link_code_expires_at: expires },
    { onConflict: 'user_id' }
  )

  return NextResponse.json({
    connected: false,
    code,
    addFriendUrl: process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL,
  })
}
