export type ICSEvent = {
  name: string
  start_at: Date
  end_at?: Date
  detail?: string
}

export function parseICS(raw: string): ICSEvent | null {
  const veventMatch = raw.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/)
  if (!veventMatch) return null
  const block = veventMatch[1]

  const get = (key: string): string | undefined => {
    const match = block.match(new RegExp(`^${key}[;:][^\r\n]*`, 'm'))
    if (!match) return undefined
    return match[0].replace(/^[^:]+:/, '').trim()
  }

  const summary = get('SUMMARY')
  const dtstart = get('DTSTART')
  if (!summary || !dtstart) return null

  const dtend = get('DTEND')
  const description = get('DESCRIPTION')

  return {
    name: summary.replace(/\\,/g, ',').replace(/\\\\/g, '\\'),
    start_at: parseICSDate(dtstart),
    ...(dtend ? { end_at: parseICSDate(dtend) } : {}),
    ...(description ? { detail: description.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\') } : {}),
  }
}

function parseICSDate(value: string): Date {
  // Strip TZID param if present: "TZID=Asia/Jakarta:20260510T160000" → "20260510T160000"
  const raw = value.includes(':') ? value.split(':').pop()! : value

  if (raw.length === 8) {
    // Date only: 20260510
    return new Date(Date.UTC(
      parseInt(raw.slice(0, 4)),
      parseInt(raw.slice(4, 6)) - 1,
      parseInt(raw.slice(6, 8)),
    ))
  }

  // Datetime: 20260510T140000Z or 20260510T140000
  return new Date(Date.UTC(
    parseInt(raw.slice(0, 4)),
    parseInt(raw.slice(4, 6)) - 1,
    parseInt(raw.slice(6, 8)),
    parseInt(raw.slice(9, 11)),
    parseInt(raw.slice(11, 13)),
    parseInt(raw.slice(13, 15)),
  ))
}
