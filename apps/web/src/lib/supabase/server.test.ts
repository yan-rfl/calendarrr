import { describe, it, expect, vi } from 'vitest'
describe('createServerClient', () => {
  it('is importable without throwing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
    await expect(import('./server')).resolves.toBeDefined()
    vi.unstubAllEnvs()
  })
})
