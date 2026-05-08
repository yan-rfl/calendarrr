import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EventCard } from './EventCard'
import type { CalendarEvent } from '@calendarrr/types'

const base: CalendarEvent = {
  id: 'e1', user_id: 'u1', name: 'Dentist', detail: 'Bring X-rays',
  start_at: '2026-05-10T14:00:00.000Z', end_at: null,
  source: 'manual', external_id: null,
  created_at: '2026-05-08T00:00:00.000Z', updated_at: '2026-05-08T00:00:00.000Z',
}

describe('EventCard', () => {
  it('shows event name', () => {
    render(<EventCard event={base} />)
    expect(screen.getByText('Dentist')).toBeInTheDocument()
  })
  it('shows detail when present', () => {
    render(<EventCard event={base} />)
    expect(screen.getByText('Bring X-rays')).toBeInTheDocument()
  })
  it('renders without detail', () => {
    render(<EventCard event={{ ...base, detail: null }} />)
    expect(screen.getByText('Dentist')).toBeInTheDocument()
  })
})
