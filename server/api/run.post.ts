import { buildDocument } from '../pipeline/document'
import { fetchInstagramProfile, hasEnoughSignal, normalizeHandle } from '../pipeline/scraper'

const FOLLOWERS = ['none', 'under_5k', '5k_25k', '25k_100k', '100k_plus']

const STATUS_MESSAGES: Record<string, string> = {
  private: "That account is private, so we can't read it.",
  not_found: "We couldn't find that Instagram account.",
  blocked: 'Instagram data is temporarily unavailable.',
  failed: "We couldn't read that account right now.",
  partial: "We found the account, but there isn't enough public content to learn from.",
}

/** Cheap local check before spending an LLM call. The LLM catches subtler gibberish. */
const looksEmpty = (s: string) => (s.match(/\p{L}+/gu) || []).length < 2 || s.length < 10

/** Step 1: Instagram handle or a manual description -> validated creator profile. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (body?.mode === 'instagram') {
    const handle = normalizeHandle(text(body.handle, 100))
    if (!handle) return fail('invalid_handle', "That doesn't look like a valid Instagram handle.")
    const ig = await fetchInstagramProfile(handle)
    if (!hasEnoughSignal(ig)) {
      const status = ig.extraction_status === 'completed' ? 'partial' : ig.extraction_status
      return fail(status, STATUS_MESSAGES[status] ?? STATUS_MESSAGES.failed!, true)
    }
    return { ok: true, document: await buildDocument('instagram', ig) }
  }

  if (body?.mode === 'manual') {
    const m = body.manual ?? {}
    const description = text(m.description, 2000)
    if (looksEmpty(description)) {
      return fail('too_short', "That's a bit short. A line about what you do and what you create works best.")
    }
    const manual = {
      description,
      audience: text(m.audience, 500) || null,
      credibility: text(m.credibility, 1000) || null,
      existing_prices: text(m.existing_prices, 1000) || null,
      follower_range: (FOLLOWERS.includes(m.follower_range) ? m.follower_range : 'unknown') as any,
      language: (LANGUAGES.includes(m.language) ? m.language : 'english') as any,
    }
    return { ok: true, document: await buildDocument('manual', null, manual) }
  }

  throw createError({ statusCode: 400, statusMessage: "mode must be 'instagram' or 'manual'" })
})
