import { createServerClient as _create } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@calendarrr/db'

export async function createServerClient() {
  const cookieStore = await cookies()
  return _create<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* server component — ignore */ }
        },
      },
    }
  )
}
