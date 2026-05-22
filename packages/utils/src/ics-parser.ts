export type ICSEvent = {
  name: string
  start_at: Date
  end_at?: Date
  detail?: string
}

export function parseICS(raw: string): ICSEvent | null {
  // Unfold RFC 5545 folded lines (continuation lines start with space/tab)
  const unfolded = raw.replace(/\r?\n[ \t]/g, '')
  const veventMatch = unfolded.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/)
  if (!veventMatch) return null
  const block = veventMatch[1]

  const get = (key: string): string | undefined => {
    const match = block.match(new RegExp(`^${key}([;:][^\r\n]*)`, 'm'))
    if (!match) return undefined
    // Return everything after the property name (includes params like ;TZID=...)
    return match[1].slice(1).trim() // strip leading ; or :
  }

  const summary = get('SUMMARY')
  const dtstart = get('DTSTART')
  if (!summary || !dtstart) return null

  const dtend = get('DTEND')
  const description = get('DESCRIPTION')

  return {
    name: summary.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\'),
    start_at: parseICSDate(dtstart),
    ...(dtend ? { end_at: parseICSDate(dtend) } : {}),
    ...(description ? { detail: description.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\') } : {}),
  }
}

function parseICSDate(value: string): Date {
  // Check for TZID: "TZID=Asia/Jakarta:20260510T160000"
  const tzidMatch = value.match(/TZID=([^:;]+):(.+)/)
  if (tzidMatch) {
    return parseWithTZID(tzidMatch[2], tzidMatch[1])
  }
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

function parseWithTZID(datetime: string, tzid: string): Date {
  const y = parseInt(datetime.slice(0, 4))
  const mo = parseInt(datetime.slice(4, 6)) - 1
  const d = parseInt(datetime.slice(6, 8))
  const h = parseInt(datetime.slice(9, 11))
  const min = parseInt(datetime.slice(11, 13))
  try {
    // Treat local time as UTC first, then find the actual offset
    const utcGuess = new Date(Date.UTC(y, mo, d, h, min, 0))
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tzid,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(utcGuess)
    const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value)
    const tzLocalMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    const offsetMs = tzLocalMs - utcGuess.getTime()
    return new Date(utcGuess.getTime() - offsetMs)
  } catch {
    // Unknown timezone — treat as UTC wall-clock
    return new Date(Date.UTC(y, mo, d, h, min, 0))
  }
}
