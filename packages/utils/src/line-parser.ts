export type ParseResult =
  | { type: 'create'; name: string; start_at: Date; detail?: string }
  | { type: 'list_today' }
  | { type: 'list_date'; date: string }
  | { type: 'list_upcoming' }
  | { type: 'update'; name: string; start_at: Date }
  | { type: 'remind'; name: string; offset_minutes: number }
  | { type: 'delete'; name: string }
  | { type: 'help' }
  | { type: 'unknown'; raw: string }

// tzOffsetMs: user's UTC offset in milliseconds (e.g. UTC+7 Jakarta = 7*3600*1000)
// Applied to absolute date/time formats only — relative ("In N minutes") is tz-independent.
export function parseLineMessage(text: string, now: Date = new Date(), tzOffsetMs = 0): ParseResult {
  const t = text.trim()
  const lower = t.toLowerCase()

  if (lower === 'help') return { type: 'help' }
  if (lower === 'today' || lower === 'list today') return { type: 'list_today' }
  if (lower === 'upcoming' || lower === 'next') return { type: 'list_upcoming' }

  const listDate = t.match(/^list\s+(\d{4}-\d{2}-\d{2})$/i)
  if (listDate) return { type: 'list_date', date: listDate[1] }

  const del = t.match(/^delete\s+(.+)$/i)
  if (del) return { type: 'delete', name: del[1].trim() }

  const upd = t.match(/^update\s+(.+?)\s+to\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}(?::\d{2})?)\s*(AM|PM)?$/i)
  if (upd) {
    const hhmm = parseTimeToHHMM(upd[3], upd[4])
    return { type: 'update', name: upd[1].trim(), start_at: shiftTz(new Date(`${upd[2]}T${hhmm}:00`), tzOffsetMs) }
  }

  const remind = t.match(/^remind\s+(.+?)\s+(\d+)\s+(min(?:utes?)?|hours?)\s+before$/i)
  if (remind) {
    const n = parseInt(remind[2])
    const offset_minutes = remind[3].toLowerCase().startsWith('h') ? -(n * 60) : -n
    return { type: 'remind', name: remind[1].trim(), offset_minutes }
  }

  const structured = t.match(/^(.+)_(\d{4}-\d{2}-\d{2})\s+(\d{1,2}(?::\d{2})?)\s*(AM|PM)?(?:_(.+))?$/i)
  if (structured) {
    const hhmm = parseTimeToHHMM(structured[3], structured[4])
    return {
      type: 'create',
      name: structured[1].trim(),
      start_at: shiftTz(new Date(`${structured[2]}T${hhmm}:00`), tzOffsetMs),
      ...(structured[5] ? { detail: structured[5].trim() } : {}),
    }
  }

  const todayAt = t.match(/^(.+)_Today at (\d{1,2}:\d{2})\s*(AM|PM)?$/i)
  if (todayAt) return { type: 'create', name: todayAt[1].trim(), start_at: parseLocalTime(todayAt[2], todayAt[3], now, 0, tzOffsetMs) }

  const tomorrowAt = t.match(/^(.+)_Tomorrow at (\d{1,2}:\d{2})\s*(AM|PM)?$/i)
  if (tomorrowAt) return { type: 'create', name: tomorrowAt[1].trim(), start_at: parseLocalTime(tomorrowAt[2], tomorrowAt[3], now, 1, tzOffsetMs) }

  const inRelative = t.match(/^(.+)_In (a|\d+)\s+(minutes?|hours?)$/i)
  if (inRelative) {
    const n = inRelative[2].toLowerCase() === 'a' ? 1 : parseInt(inRelative[2])
    const ms = inRelative[3].toLowerCase().startsWith('h') ? n * 3600000 : n * 60000
    return { type: 'create', name: inRelative[1].trim(), start_at: new Date(now.getTime() + ms) }
  }

  return { type: 'unknown', raw: t }
}

function shiftTz(date: Date, tzOffsetMs: number): Date {
  return tzOffsetMs === 0 ? date : new Date(date.getTime() - tzOffsetMs)
}

function parseTimeToHHMM(timeStr: string, meridiem?: string): string {
  const parts = timeStr.split(':')
  let h = parseInt(parts[0])
  const m = parts[1] ? parseInt(parts[1]) : 0
  const mer = meridiem?.toUpperCase()
  if (mer === 'PM' && h !== 12) h += 12
  if (mer === 'AM' && h === 12) h = 0
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function parseLocalTime(timeStr: string, meridiem: string | undefined, base: Date, dayOffset: number, tzOffsetMs = 0): Date {
  const [hStr, mStr] = timeStr.split(':')
  let h = parseInt(hStr)
  const m = mStr ? parseInt(mStr) : 0
  if (meridiem?.toUpperCase() === 'PM' && h !== 12) h += 12
  if (meridiem?.toUpperCase() === 'AM' && h === 12) h = 0
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return shiftTz(d, tzOffsetMs)
}
