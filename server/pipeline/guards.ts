/**
 * Quality-control checks on LLM output. Plain code so they are easy to test.
 *
 * Key rule: a credibility claim (certification, years of experience, results) is only allowed if the creator
 * themselves wrote it. Enforced by requiring a verbatim quote that exists in the trusted source text.
 */

const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
export const NUMBER_RE = /\d[\d,.]*/g

export interface Claim {
  claim: string
  source: string
  quote: string
}

/** allowedSource: 'bio' for the Instagram path, 'user_input' for the manual path. */
export function verifyClaims(claims: Claim[], sourceText: string, allowedSource: string) {
  const src = norm(sourceText)
  const srcNoComma = src.replace(/,/g, '')
  const accepted: Claim[] = []
  const rejected: (Claim & { reason: string })[] = []
  for (const c of claims) {
    let reason: string | null = null
    const quote = norm(c.quote)
    if (c.source !== allowedSource) {
      reason = `source '${c.source}' not allowed on this path`
    } else if (!quote || !src.includes(quote)) {
      reason = 'quote not found verbatim in source text'
    } else {
      for (const raw of c.claim.match(NUMBER_RE) || []) {
        const n = raw.replace(/[.,]+$/, '').replace(/,/g, '')
        if (n && !srcNoComma.includes(n)) {
          reason = `number '${n}' not present in source text`
          break
        }
      }
    }
    if (reason) rejected.push({ ...c, reason })
    else accepted.push({ claim: c.claim, source: c.source, quote: c.quote })
  }
  return { accepted, rejected }
}

export interface ScoredT {
  value: string | null
  confidence: number
  evidence: string[]
}

/** Drop evidence ids that don't exist. A value with no valid evidence gets its confidence capped. */
export function sanitizeScored(scored: Partial<ScoredT>, validIds: Set<string>): ScoredT {
  const ev = (scored.evidence || []).filter((e) => validIds.has(e))
  let conf = Number(scored.confidence ?? 0)
  if (scored.value && !ev.length) conf = Math.min(conf, 0.5)
  if (!scored.value) conf = 0
  return { value: scored.value ?? null, confidence: Math.round(conf * 100) / 100, evidence: ev }
}

const CONFIRMABLE = ['niche', 'sub_niche', 'target_audience'] as const

/** Anything missing or low-confidence goes on the "check this" list. */
export function autoNeedsConfirmation(
  inferred: Record<(typeof CONFIRMABLE)[number], { value: string | null; confidence: number }>,
  existing: string[],
  threshold = 0.7,
) {
  const out = existing.filter((f) => (CONFIRMABLE as readonly string[]).includes(f))
  for (const field of CONFIRMABLE) {
    const s = inferred[field]
    if ((!s.value || s.confidence < threshold) && !out.includes(field)) out.push(field)
  }
  return out
}
