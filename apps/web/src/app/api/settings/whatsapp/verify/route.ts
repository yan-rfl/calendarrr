import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { z } from 'zod'

const schema = z.object({
  phone: z.string().min(7),
  otp: z.string().length(6).optional(),
})

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { phone, otp } = parsed.data

  if (!otp) {
    const code = generateOtp()
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const { error } = await supabase.from('whatsapp_sessions').upsert(
      { user_id: user.id, phone_number: phone, pending_otp: code, pending_otp_expires_at: expires },
      { onConflict: 'user_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await sendWhatsAppMessage(phone, `Your CalendaRRR verification code: ${code}\n\nExpires in 10 minutes.`)
    return NextResponse.json({ sent: true })
  }

  const { data: session, error } = await supabase
    .from('whatsapp_sessions')
    .select('pending_otp, pending_otp_expires_at')
    .eq('user_id', user.id)
    .single()
  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (
    session.pending_otp !== otp ||
    !session.pending_otp_expires_at ||
    new Date(session.pending_otp_expires_at) < new Date()
  ) return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })

  await supabase.from('whatsapp_sessions').update({
    verified_at: new Date().toISOString(),
    pending_otp: null,
    pending_otp_expires_at: null,
  }).eq('user_id', user.id)

  return NextResponse.json({ verified: true })
}
