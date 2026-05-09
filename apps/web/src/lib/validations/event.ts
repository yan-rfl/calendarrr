import { z } from 'zod'

export const createEventSchema = z.object({
  name: z.string().min(1).max(255),
  detail: z.string().max(2000).optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime().optional(),
  source: z.enum(['manual','line','gmail','outlook','imap']).default('manual'),
})

export const updateEventSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  detail: z.string().max(2000).nullable().optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().nullable().optional(),
}).refine(obj => Object.values(obj).some(v => v !== undefined), {
  message: 'At least one field required',
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
