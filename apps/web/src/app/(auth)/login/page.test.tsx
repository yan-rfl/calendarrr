import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LoginPage from './page'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOtp: vi.fn(), signInWithOAuth: vi.fn() } }),
}))

describe('LoginPage', () => {
  it('renders email input and submit button', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /magic link/i })).toBeInTheDocument()
  })
  it('renders Google and Microsoft buttons', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument()
  })
})
