export type EventSource = 'manual' | 'whatsapp' | 'gmail' | 'outlook' | 'imap'

export interface CalendarEvent {
  id: string
  user_id: string
  name: string
  detail: string | null
  start_at: string
  end_at: string | null
  source: EventSource
  external_id: string | null
  created_at: string
  updated_at: string
}

export interface NotificationRule {
  id: string
  user_id: string
  event_id: string | null
  offset_minutes: number
  created_at: string
}
