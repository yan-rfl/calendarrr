import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { registerGmailWatch } from '@/lib/gmail'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const cookieStore = await cookies()
  const savedState = cookieStore.get('oauth_state')?.value
  cookieStore.delete('oauth_state')

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${url.origin}/settings?error=oauth_failed`)
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${url.origin}/login`)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: `${url.origin}/api/settings/email/gmail/callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return NextResponse.redirect(`${url.origin}/settings?error=oauth_failed`)
  const tokens = await tokenRes.json()
  if (!tokens.access_token) return NextResponse.redirect(`${url.origin}/settings?error=oauth_failed`)

  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!userinfoRes.ok) return NextResponse.redirect(`${url.origin}/settings?error=oauth_failed`)
  const userinfo = await userinfoRes.json()
  if (!userinfo.email) return NextResponse.redirect(`${url.origin}/settings?error=oauth_failed`)

  let historyId: string, expiry: string
  try {
    const watch = await registerGmailWatch(tokens.access_token)
    historyId = watch.historyId
    expiry = watch.expiry
  } catch {
    return NextResponse.redirect(`${url.origin}/settings?error=oauth_failed`)
  }

  const { error: upsertError } = await supabase.from('email_connections').upsert(
    {
      user_id: user.id,
      provider: 'gmail',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      imap_user: userinfo.email,
      sync_metadata: { historyId, watchExpiry: expiry },
    },
    { onConflict: 'user_id,provider' },
  )
  if (upsertError) return NextResponse.redirect(`${url.origin}/settings?error=oauth_failed`)

  return NextResponse.redirect(`${url.origin}/settings?connected=gmail`)
}
