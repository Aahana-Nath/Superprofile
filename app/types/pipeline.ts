export interface Scored {
  value: string | null
  confidence: number
  evidence: string[]
}

export interface Post {
  id: string
  type: string
  caption: string | null
  likes: number | null
  comments: number | null
  url: string | null
  image_url?: string | null
}

export interface InstagramData {
  username: string
  display_name: string | null
  bio: string | null
  profile_image_url: string | null
  follower_count: number | null
  following_count: number | null
  post_count: number | null
  is_verified: boolean
  external_link: string | null
  posts: Post[]
  derived_metrics: {
    posts_analyzed: number
    avg_likes: number | null
    avg_comments: number | null
    engagement_rate: number | null
    caption_script: string | null
  }
}

export interface ManualData {
  description: string
  audience: string | null
  follower_range: string
  language: string
  credibility: string | null
  existing_prices: string | null
}

export interface CreatorDocument {
  input_method: 'instagram' | 'manual'
  generated_at: string
  instagram_data: InstagramData | null
  manual_data: ManualData | null
  inferred: {
    niche: Scored
    sub_niche: Scored
    target_audience: Scored
    recurring_themes: string[]
    content_tone: string[]
    output_language: string
    engagement_level: string
  }
  credibility_claims: { claim: string; source: string; quote: string }[]
  gaps: {
    unknown_fields: string[]
    needs_confirmation: string[]
    rejected_claims: unknown[]
  }
  quality_control: {
    llm_provider: string
    llm_model: string
    llm_attempts: number
    inference_status: string
    input_quality: string
    input_quality_note: string | null
    latency_seconds: number
    last_error: string | null
  }
}

export type RunResponse =
  | { ok: true; document: CreatorDocument }
  | { ok: false; code: string; message: string; fallback_to_manual: boolean }

export type Language = 'english' | 'hinglish' | 'hindi'

export interface Product {
  id: string
  format: string
  title: string
  description: string
  price_inr: number
  price_rationale?: string
  cta: string
  /** Product photo: auto-picked from the creator's feed; null = creator chose none. */
  image_url?: string | null
  /** Editor only: the creator picked this idea for their store. */
  added?: boolean
}

export interface Pledge {
  enabled: boolean
  percent: number
  recipient: string | null
  purpose: string | null
  confirmed: boolean
}

export interface Store {
  name: string
  handle: string | null
  avatar_url: string | null
  cover_url?: string | null
  theme?: { color: string }
  language: Language
  headline: string
  bio: string
  products: Product[]
  playbook?: { id: string; label: string }
  pledge?: Pledge | null
  disclaimer?: string | null
  insights?: string[]
  tips?: string[]
}

export interface PublishedStore extends Store {
  id: string
  published_at: string
  updated_at: string
}

export type Failure = { ok: false; code: string; message: string }
export type GenerateResponse = { ok: true; store: Omit<Store, 'name' | 'handle' | 'avatar_url'> } | Failure
export type RegenerateResponse = { ok: true; result: any } | Failure

export const FORMAT_LABELS: Record<string, string> = {
  ebook: 'Ebook / guide',
  template_pack: 'Template pack',
  workshop: 'Live workshop',
  recorded_course: 'Recorded course',
  cohort_course: 'Cohort course',
  one_on_one: '1:1 session',
  community: 'Community',
  donation: 'Support the work',
  sponsorship: 'Monthly sponsorship',
}

export const MONTHLY_FORMATS = new Set(['community', 'sponsorship'])

/** Rendered in code (not by the LLM) so the money promise says exactly what the creator confirmed. */
export function pledgeText(p: Pledge, language: Language): string {
  const to = p.recipient?.trim()
  const why = p.purpose?.trim()
  if (language === 'hindi') {
    return `यहाँ की हर कमाई का ${p.percent}% ${to ? `${to} को जाता है` : 'इस काम में लगता है'}${why ? `: ${why}` : ''}।`
  }
  if (language === 'hinglish') {
    return `Yahan ki har kamai ka ${p.percent}% ${to ? `${to} ko jaata hai` : 'is kaam mein lagta hai'}${why ? `: ${why}` : ''}.`
  }
  return `${p.percent}% of every payment here goes ${to ? `to ${to}` : 'to this work'}${why ? `: ${why}` : ''}.`
}

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'hinglish', label: 'Hinglish' },
  { value: 'hindi', label: 'हिंदी' },
]

export const formatPrice = (p: Product) =>
  `₹${new Intl.NumberFormat('en-IN').format(p.price_inr)}${MONTHLY_FORMATS.has(p.format) ? '/month' : ''}`

export interface Theme {
  id: string
  label: string
  accent: string // buttons, avatar ring, initials
  ink: string // headline text
  soft: string // header gradient start, badges
  soft2: string // header gradient end
}

export const THEMES: Theme[] = [
  { id: 'indigo', label: 'Indigo', accent: '#4f46e5', ink: '#312e81', soft: '#eef2ff', soft2: '#fdf2f8' },
  { id: 'rose', label: 'Rose', accent: '#e11d48', ink: '#881337', soft: '#fff1f2', soft2: '#fff7ed' },
  { id: 'amber', label: 'Marigold', accent: '#d97706', ink: '#78350f', soft: '#fffbeb', soft2: '#fff1f2' },
  { id: 'emerald', label: 'Emerald', accent: '#059669', ink: '#064e3b', soft: '#ecfdf5', soft2: '#f0f9ff' },
  { id: 'sky', label: 'Sky', accent: '#0284c7', ink: '#0c4a6e', soft: '#f0f9ff', soft2: '#eef2ff' },
  { id: 'violet', label: 'Violet', accent: '#7c3aed', ink: '#4c1d95', soft: '#f5f3ff', soft2: '#fdf2f8' },
  { id: 'charcoal', label: 'Charcoal', accent: '#111827', ink: '#111827', soft: '#f3f4f6', soft2: '#fafafa' },
]

/** A starting colour per creator type; the creator can change it. */
export const SUGGESTED_THEME: Record<string, string> = {
  cause: 'amber',
  finance: 'emerald',
  health: 'rose',
  education: 'sky',
  general: 'indigo',
}

export const themeById = (id?: string | null) => THEMES.find((t) => t.id === id) ?? THEMES[0]!

/**
 * Give products without a photo one from the creator's feed (most-liked first), skipping the cover and
 * any photo another product already uses. A product whose image_url is null was cleared on purpose.
 */
export function assignProductImages(products: Product[], feed: string[], cover?: string | null) {
  const used = new Set([cover, ...products.map((p) => p.image_url)].filter(Boolean))
  const free = feed.filter((u) => !used.has(u))
  for (const p of products) {
    if (p.image_url === undefined) p.image_url = free.shift() ?? null
  }
  return products
}

// Donation-style formats only make sense for cause creators (or if a product already uses one).
const CAUSE_ONLY = new Set(['donation', 'sponsorship'])
export const formatOptionsFor = (store: Store, current: string) =>
  Object.fromEntries(
    Object.entries(FORMAT_LABELS).filter(([key]) => !CAUSE_ONLY.has(key) || store.playbook?.id === 'cause' || key === current),
  )

/** Best feed image for a cover banner: most-liked post that has an image. */
export function pickCover(posts: { image_url?: string | null; likes?: number | null }[] = []): string | null {
  const withImages = posts.filter((p) => p.image_url)
  withImages.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
  return withImages[0]?.image_url ?? null
}
