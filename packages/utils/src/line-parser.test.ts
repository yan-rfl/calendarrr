import { describe, it, expect } from 'vitest'
import { parseLineMessage as parseWhatsAppMessage } from './line-parser'

const NOW = new Date('2026-05-08T10:00:00.000Z')

describe('help', () => {
  it('parses /help', () => {
    expect(parseWhatsAppMessage('/help', NOW)).toEqual({ type: 'help' })
  })
})

describe('list today', () => {
  it('parses "/today"', () => {
    expect(parseWhatsAppMessage('/today', NOW)).toEqual({ type: 'list_today' })
  })
  it('parses "/list today"', () => {
    expect(parseWhatsAppMessage('/list today', NOW)).toEqual({ type: 'list_today' })
  })
})

describe('list upcoming', () => {
  it('parses "/upcoming"', () => {
    expect(parseWhatsAppMessage('/upcoming', NOW)).toEqual({ type: 'list_upcoming' })
  })
  it('parses "/next"', () => {
    expect(parseWhatsAppMessage('/next', NOW)).toEqual({ type: 'list_upcoming' })
  })
})

describe('list by date', () => {
  it('parses /list date', () => {
    expect(parseWhatsAppMessage('/list 2026-05-10', NOW)).toEqual({ type: 'list_date', date: '2026-05-10' })
  })
})

describe('delete', () => {
  it('parses /delete', () => {
    expect(parseWhatsAppMessage('/delete Dentist', NOW)).toEqual({ type: 'delete', name: 'Dentist' })
  })
  it('preserves name casing', () => {
    expect(parseWhatsAppMessage('/delete My Meeting', NOW)).toEqual({ type: 'delete', name: 'My Meeting' })
  })
})

describe('update', () => {
  it('parses /update to datetime 24H', () => {
    const result = parseWhatsAppMessage('/update Dentist to 2026-05-10 14:00', NOW)
    expect(result.type).toBe('update')
    if (result.type === 'update') {
      expect(result.name).toBe('Dentist')
      expect(result.start_at.getHours()).toBe(14)
      expect(result.start_at.getMinutes()).toBe(0)
    }
  })
  it('parses /update to datetime 12H with minutes', () => {
    const result = parseWhatsAppMessage('/update Dentist to 2026-05-10 2:00 PM', NOW)
    expect(result.type).toBe('update')
    if (result.type === 'update') {
      expect(result.start_at.getHours()).toBe(14)
      expect(result.start_at.getMinutes()).toBe(0)
    }
  })
  it('parses /update to datetime 12H without minutes', () => {
    const result = parseWhatsAppMessage('/update Dentist to 2026-05-10 2 PM', NOW)
    expect(result.type).toBe('update')
    if (result.type === 'update') {
      expect(result.start_at.getHours()).toBe(14)
      expect(result.start_at.getMinutes()).toBe(0)
    }
  })
})

describe('remind', () => {
  it('parses /remind N min before', () => {
    expect(parseWhatsAppMessage('/remind Dentist 30 min before', NOW))
      .toEqual({ type: 'remind', name: 'Dentist', offset_minutes: -30 })
  })
  it('parses /remind N minutes before', () => {
    expect(parseWhatsAppMessage('/remind Dentist 15 minutes before', NOW))
      .toEqual({ type: 'remind', name: 'Dentist', offset_minutes: -15 })
  })
  it('parses /remind N hour before', () => {
    expect(parseWhatsAppMessage('/remind Dentist 1 hour before', NOW))
      .toEqual({ type: 'remind', name: 'Dentist', offset_minutes: -60 })
  })
  it('parses /remind N hours before', () => {
    expect(parseWhatsAppMessage('/remind Meeting 2 hours before', NOW))
      .toEqual({ type: 'remind', name: 'Meeting', offset_minutes: -120 })
  })
})

describe('create structured', () => {
  it('parses /create Name_date time 24H', () => {
    const result = parseWhatsAppMessage('/create Dentist_2026-05-10 14:00', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Dentist')
      expect(result.start_at.getHours()).toBe(14)
      expect(result.detail).toBeUndefined()
    }
  })
  it('parses /create Name_date time_detail 24H', () => {
    const result = parseWhatsAppMessage('/create Dentist_2026-05-10 14:00_Bring X-rays', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Dentist')
      expect(result.detail).toBe('Bring X-rays')
    }
  })
  it('parses /create Name_date time 12H with minutes', () => {
    const result = parseWhatsAppMessage('/create Dentist_2026-05-10 2:00 PM', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Dentist')
      expect(result.start_at.getHours()).toBe(14)
      expect(result.start_at.getMinutes()).toBe(0)
    }
  })
  it('parses /create Name_date time 12H without minutes', () => {
    const result = parseWhatsAppMessage('/create Dentist_2026-05-10 2 PM', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Dentist')
      expect(result.start_at.getHours()).toBe(14)
      expect(result.start_at.getMinutes()).toBe(0)
    }
  })
  it('parses /create Name_date time_detail 12H', () => {
    const result = parseWhatsAppMessage('/create Dentist_2026-05-10 2 PM_Bring X-rays', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Dentist')
      expect(result.start_at.getHours()).toBe(14)
      expect(result.detail).toBe('Bring X-rays')
    }
  })
  it('parses 12 AM as midnight', () => {
    const result = parseWhatsAppMessage('/create Event_2026-05-10 12:00 AM', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') expect(result.start_at.getHours()).toBe(0)
  })
  it('parses 12 PM as noon', () => {
    const result = parseWhatsAppMessage('/create Event_2026-05-10 12:00 PM', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') expect(result.start_at.getHours()).toBe(12)
  })
})

describe('create relative', () => {
  it('parses /create Today at time', () => {
    const result = parseWhatsAppMessage('/create Get Laundry_Today at 12:00 PM', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Get Laundry')
      expect(result.start_at.getHours()).toBe(12)
      expect(result.start_at.getMinutes()).toBe(0)
    }
  })
  it('parses /create Today at time 24H', () => {
    const result = parseWhatsAppMessage('/create Standup_Today at 13:30', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.name).toBe('Standup')
      expect(result.start_at.getHours()).toBe(13)
      expect(result.start_at.getMinutes()).toBe(30)
    }
  })
  it('parses /create Tomorrow at time 24H', () => {
    const result = parseWhatsAppMessage('/create Meeting_Tomorrow at 09:00', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      expect(result.start_at.getHours()).toBe(9)
      expect(result.start_at.getMinutes()).toBe(0)
    }
  })
  it('parses /create Tomorrow at time', () => {
    const result = parseWhatsAppMessage('/create Meeting_Tomorrow at 9:00 AM', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      const tomorrow = new Date(NOW)
      tomorrow.setDate(tomorrow.getDate() + 1)
      expect(result.start_at.getDate()).toBe(tomorrow.getDate())
    }
  })
  it('parses /create In N minutes', () => {
    const result = parseWhatsAppMessage('/create Call_In 30 minutes', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      const expected = new Date(NOW.getTime() + 30 * 60000)
      expect(result.start_at.getTime()).toBeCloseTo(expected.getTime(), -3)
    }
  })
  it('parses /create In N hours', () => {
    const result = parseWhatsAppMessage('/create Lunch_In 2 hours', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      const expected = new Date(NOW.getTime() + 2 * 3600000)
      expect(result.start_at.getTime()).toBeCloseTo(expected.getTime(), -3)
    }
  })
  it('parses /create In a minute', () => {
    const result = parseWhatsAppMessage('/create Ping_In a minute', NOW)
    expect(result.type).toBe('create')
    if (result.type === 'create') {
      const expected = new Date(NOW.getTime() + 60000)
      expect(result.start_at.getTime()).toBeCloseTo(expected.getTime(), -3)
    }
  })
})

describe('create-list', () => {
  it('parses /create-list with multiple events', () => {
    const msg = '/create-list\nDentist_2026-05-10 14:00\nMeeting_2026-05-11 9:00 AM'
    const result = parseWhatsAppMessage(msg, NOW)
    expect(result.type).toBe('create_list')
    if (result.type === 'create_list') {
      expect(result.events).toHaveLength(2)
      expect(result.events[0].name).toBe('Dentist')
      expect(result.events[0].start_at.getHours()).toBe(14)
      expect(result.events[1].name).toBe('Meeting')
      expect(result.events[1].start_at.getHours()).toBe(9)
    }
  })
  it('parses /create-list with relative times', () => {
    const msg = '/create-list\nCall_In 30 minutes\nLunch_Tomorrow at 12:00 PM'
    const result = parseWhatsAppMessage(msg, NOW)
    expect(result.type).toBe('create_list')
    if (result.type === 'create_list') {
      expect(result.events).toHaveLength(2)
      expect(result.events[0].name).toBe('Call')
      expect(result.events[1].name).toBe('Lunch')
    }
  })
  it('skips unparseable lines silently', () => {
    const msg = '/create-list\nDentist_2026-05-10 14:00\nnot a valid event'
    const result = parseWhatsAppMessage(msg, NOW)
    expect(result.type).toBe('create_list')
    if (result.type === 'create_list') {
      expect(result.events).toHaveLength(1)
      expect(result.events[0].name).toBe('Dentist')
    }
  })
})

describe('unknown', () => {
  it('returns unknown for unrecognized input', () => {
    expect(parseWhatsAppMessage('what is the weather', NOW))
      .toEqual({ type: 'unknown', raw: 'what is the weather' })
  })
  it('returns unknown for commands without slash prefix', () => {
    expect(parseWhatsAppMessage('delete Dentist', NOW))
      .toEqual({ type: 'unknown', raw: 'delete Dentist' })
  })
})
