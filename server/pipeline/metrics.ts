/** Deterministic metrics computed in code (no LLM). */

const DEVANAGARI = /[\u0900-\u097F]/g
const LATIN = /[A-Za-z]/g

// Roman-script Hindi words that are unlikely to appear in normal English text.
const HINGLISH_WORDS = new Set([
  'hai', 'hain', 'nahi', 'nahin', 'kya', 'kaise', 'kaisa', 'aap', 'aapko', 'tum', 'tumhe',
  'mera', 'meri', 'mere', 'apna', 'apni', 'apne', 'karo', 'kare', 'karna', 'kiya', 'kuch',
  'bahut', 'sab', 'yeh', 'woh', 'ko', 'ke', 'ki', 'ka', 'mein', 'se', 'liye', 'lekin',
  'aur', 'bhi', 'toh', 'chahiye', 'hota', 'hoti', 'hoga', 'raha', 'rahe', 'rahi', 'wala',
  'wali', 'din', 'abhi', 'jab', 'agar', 'kyun', 'kyunki', 'sirf', 'zyada', 'accha', 'achha',
  'dost', 'bhai', 'yaar', 'paisa', 'paise', 'seekho', 'sikho', 'jaldi', 'roz',
])

export function detectCaptionScript(texts: (string | null | undefined)[]) {
  const joined = texts.filter(Boolean).join(' ')
  const dev = (joined.match(DEVANAGARI) || []).length
  const lat = (joined.match(LATIN) || []).length
  const total = dev + lat
  if (total < 20) return 'unknown' as const
  if (dev / total > 0.3) return 'devanagari' as const
  const words = joined.toLowerCase().match(/[a-z]+/g) || []
  if (words.length && words.filter((w) => HINGLISH_WORDS.has(w)).length / words.length > 0.06) return 'hinglish' as const
  return 'english' as const
}

/**
 * Rough benchmark bands: bigger accounts naturally have lower engagement rates.
 * These thresholds are heuristics; tune them with real data.
 */
export function engagementLevel(rate: number | null | undefined, followers: number | null | undefined) {
  if (rate == null || !followers) return 'unknown' as const
  const [hi, lo] = followers < 10_000 ? [6.0, 3.0] : followers < 100_000 ? [3.5, 1.5] : [2.0, 0.8]
  return rate >= hi ? 'high' : rate >= lo ? 'medium' : 'low'
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const validCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function computeMetrics(
  posts: { likes?: number | null; comments?: number | null; caption?: string | null }[],
  followers: number | null | undefined,
) {
  const likes = posts.map((p) => p.likes).filter(validCount)
  const comments = posts.map((p) => p.comments).filter(validCount)
  const avgL = likes.length ? round(mean(likes), 1) : 0
  const avgC = comments.length ? round(mean(comments), 1) : 0
  let rate: number | null = null
  if (followers && followers > 0 && (likes.length || comments.length)) rate = round(((avgL + avgC) / followers) * 100, 2)
  return {
    posts_analyzed: posts.length,
    avg_likes: avgL,
    avg_comments: avgC,
    engagement_rate: rate,
    caption_script: detectCaptionScript(posts.map((p) => p.caption)),
  }
}
