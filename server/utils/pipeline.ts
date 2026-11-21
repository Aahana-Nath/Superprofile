import { FinalDocument, type FinalDocumentT } from '../pipeline/schemas'

export const LANGUAGES = ['english', 'hinglish', 'hindi']

export const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function requireObject(v: unknown, what: string): Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw createError({ statusCode: 400, statusMessage: `Missing ${what}.` })
  }
  return v as Record<string, any>
}

/** The creator profile comes back from the browser, so validate it before it reaches the prompts. */
export function requireProfile(v: unknown): FinalDocumentT {
  const parsed = FinalDocument.safeParse(requireObject(v, 'creator profile'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Your creator profile is invalid. Please start over.' })
  return parsed.data
}

export const fail = (code: string, message: string, fallbackToManual = false) => ({
  ok: false as const,
  code,
  message,
  fallback_to_manual: fallbackToManual,
})
