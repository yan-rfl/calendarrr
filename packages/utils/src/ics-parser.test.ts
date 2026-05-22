import { describe, it, expect } from 'vitest'
import { parseICS } from './ics-parser'

const ICS_BASIC = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Dentist
DTSTART:20260510T140000Z
DTEND:20260510T150000Z
DESCRIPTION:Bring X-rays
END:VEVENT
END:VCALENDAR`

const ICS_DATE_ONLY = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:All Day Event
DTSTART;VALUE=DATE:20260510
END:VEVENT
END:VCALENDAR`

const ICS_FLOATING = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Meeting
DTSTART:20260510T090000
END:VEVENT
END:VCALENDAR`

const ICS_TZID = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Call
DTSTART;TZID=Asia/Jakarta:20260510T160000
END:VEVENT
END:VCALENDAR`

const ICS_ESCAPED = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Test
DTSTART:20260510T140000Z
DESCRIPTION:Line1\\nLine2\\,comma
END:VEVENT
END:VCALENDAR`

describe('parseICS', () => {
  it('parses name, start, end, detail from a basic ICS', () => {
    const result = parseICS(ICS_BASIC)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Dentist')
    expect(result!.start_at).toEqual(new Date('2026-05-10T14:00:00Z'))
    expect(result!.end_at).toEqual(new Date('2026-05-10T15:00:00Z'))
    expect(result!.detail).toBe('Bring X-rays')
  })

  it('parses date-only DTSTART as midnight UTC', () => {
    const result = parseICS(ICS_DATE_ONLY)
    expect(result).not.toBeNull()
    expect(result!.start_at).toEqual(new Date('2026-05-10T00:00:00Z'))
    expect(result!.end_at).toBeUndefined()
    expect(result!.detail).toBeUndefined()
  })

  it('parses floating datetime (no Z suffix)', () => {
    const result = parseICS(ICS_FLOATING)
    expect(result).not.toBeNull()
    expect(result!.start_at).toEqual(new Date('2026-05-10T09:00:00Z'))
  })

  it('parses TZID-prefixed DTSTART', () => {
    const result = parseICS(ICS_TZID)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Call')
    expect(result!.start_at.getUTCHours()).toBe(9) // 16:00 Jakarta (UTC+7) = 09:00 UTC
  })

  it('unescapes \\n and \\, in description', () => {
    const result = parseICS(ICS_ESCAPED)
    expect(result!.detail).toBe('Line1\nLine2,comma')
  })

  it('returns null when SUMMARY is missing', () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260510T140000Z\nEND:VEVENT\nEND:VCALENDAR`
    expect(parseICS(ics)).toBeNull()
  })

  it('returns null when DTSTART is missing', () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Test\nEND:VEVENT\nEND:VCALENDAR`
    expect(parseICS(ics)).toBeNull()
  })

  it('returns null when no VEVENT block exists', () => {
    expect(parseICS('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBeNull()
  })

  it('parses the first VEVENT in a multi-event ICS', () => {
    const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:First\nDTSTART:20260510T140000Z\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:Second\nDTSTART:20260511T140000Z\nEND:VEVENT\nEND:VCALENDAR`
    const result = parseICS(ics)
    expect(result!.name).toBe('First')
  })
})
