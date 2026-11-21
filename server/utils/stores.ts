import { randomBytes, timingSafeEqual } from 'node:crypto'

export const FORMATS = ['ebook', 'template_pack', 'workshop', 'recorded_course', 'cohort_course', 'one_on_one', 'community',
  'donation', 'sponsorship']
export const PLAYBOOK_IDS = ['cause', 'finance', 'health', 'education', 'general']

export interface Pledge {
  enabled: boolean
  percent: number
  recipient: string | null
  purpose: string | null
  confirmed: boolean
}

export interface PublishedProduct {
  id: string
  format: string
  title: string
  description: string
  price_inr: number
  cta: string
  image_url: string | null
}

export interface PublishedStore {
  id: string
  name: string
  handle: string | null
  avatar_url: string | null
  cover_url: string | null
  theme: { color: string }
  language: string
  headline: string
  bio: string
  products: PublishedProduct[]
  pledge: Pledge | null
  disclaimer: string | null
  published_at: string
  updated_at: string
}

interface StoredRecord {
  store: PublishedStore
  editToken: string
}

const storage = () => useStorage('stores')

export const newId = (bytes: number) => randomBytes(bytes).toString('base64url')

// avatar, cover, or one photo per product: prod-<productId>
export type ImageKind = 'avatar' | 'cover' | `prod-${string}`
const IMAGE_KIND = /^(avatar|cover|prod-[\w-]{1,24})$/
export const THEME_IDS = ['indigo', 'rose', 'amber', 'emerald', 'sky', 'violet', 'charcoal']

// ---------- image references ----------
// Three accepted forms: an https link (Instagram CDN), an upload as a data URL, or our own cached path.
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
const OWN_PATH = /^\/api\/store\/[\w-]{4,40}\/(avatar|cover|prod-[\w-]{1,24})(\?v=\d+)?$/
const MAX_IMAGE_BYTES = 1_500_000

function cleanImageRef(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s.startsWith('data:')) return s.length <= MAX_IMAGE_BYTES * 1.4 && DATA_URL.test(s) ? s : null
  if (s.length > 2000) return null
  return /^https:\/\//i.test(s) || OWN_PATH.test(s) ? s : null
}

// ---------- image cache ----------
// Instagram CDN links expire within days, which would break the page and its WhatsApp preview, so on publish
// we keep a copy. Only Instagram/Facebook CDN hosts are fetched (never arbitrary URLs); uploads are decoded.
const IMAGE_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i

interface CachedImage {
  type: string
  data: string // base64
}

async function loadImage(ref: string): Promise<CachedImage | null> {
  const m = DATA_URL.exec(ref)
  if (m) {
    const buf = Buffer.from(m[2]!, 'base64')
    return buf.length <= MAX_IMAGE_BYTES ? { type: m[1]!, data: buf.toString('base64') } : null
  }
  let host = ''
  try {
    host = new URL(ref).hostname
  } catch {
    return null
  }
  if (!IMAGE_HOSTS.test(host)) return null
  try {
    const res = await fetch(ref, { signal: AbortSignal.timeout(8000), redirect: 'error' })
    const type = (res.headers.get('content-type') || '').split(';')[0]!.trim()
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length <= MAX_IMAGE_BYTES ? { type, data: buf.toString('base64') } : null
  } catch {
    return null
  }
}

/** Returns a stable /api/store/<id>/<kind> path, or null if the image couldn't be stored. */
export async function cacheImage(id: string, kind: ImageKind, ref: string | null): Promise<string | null> {
  if (!ref) return null
  if (OWN_PATH.test(ref)) return ref
  const img = await loadImage(ref)
  if (!img) return null
  await storage().setItem<CachedImage>(`${kind}_${id}`, img)
  return `/api/store/${id}/${kind}?v=${Date.now()}`
}

export async function getImage(id: string, kind: string): Promise<CachedImage | null> {
  if (!/^[\w-]{4,40}$/.test(id) || !IMAGE_KIND.test(kind)) return null
  return (await storage().getItem<CachedImage>(`${kind}_${id}`)) ?? null
}

function cleanPledge(raw: any): Pledge | null {
  if (!raw || typeof raw !== 'object' || !raw.enabled) return null
  const pledge = {
    enabled: true,
    percent: Math.max(1, Math.min(100, Math.round(Number(raw.percent) || 100))),
    recipient: text(raw.recipient, 80) || null,
    purpose: text(raw.purpose, 140) || null,
    confirmed: raw.confirmed === true,
  }
  if (!pledge.confirmed) {
    throw createError({ statusCode: 400, statusMessage: 'Confirm your impact pledge is true, or turn it off, before publishing.' })
  }
  return pledge
}

/** Whitelists and size-limits everything the client sends. Creator-only fields (price rationale, tips) are dropped. */
export function cleanStore(raw: Record<string, any>) {
  const products = (Array.isArray(raw.products) ? raw.products : []).slice(0, 4).map((p: any) => ({
    id: (text(p?.id, 20).match(/^[\w-]+$/) ? text(p?.id, 20) : '') || newId(4),
    format: FORMATS.includes(p?.format) ? p.format : 'ebook',
    title: text(p?.title, 100),
    description: text(p?.description, 800),
    price_inr: Math.max(0, Math.min(100000, Math.round(Number(p?.price_inr) || 0))),
    cta: text(p?.cta, 40) || 'Get it',
    image_url: cleanImageRef(p?.image_url),
  }))
  const store = {
    name: text(raw.name, 60),
    handle: text(raw.handle, 40) || null,
    avatar_url: cleanImageRef(raw.avatar_url),
    cover_url: cleanImageRef(raw.cover_url),
    theme: { color: THEME_IDS.includes(raw.theme?.color) ? raw.theme.color : 'indigo' },
    language: LANGUAGES.includes(raw.language) ? raw.language : 'english',
    headline: text(raw.headline, 140),
    bio: text(raw.bio, 700),
    products: products.filter((p: PublishedProduct) => p.title),
    pledge: cleanPledge(raw.pledge),
    disclaimer: text(raw.disclaimer, 300) || null,
  }
  if (!store.name) throw createError({ statusCode: 400, statusMessage: 'Add your name before publishing.' })
  if (!store.headline && !store.bio) throw createError({ statusCode: 400, statusMessage: 'Your page needs a headline or bio.' })
  if (!store.products.length) throw createError({ statusCode: 400, statusMessage: 'Add at least one product to your store.' })
  return store
}

export async function getStore(id: string): Promise<StoredRecord | null> {
  if (!/^[\w-]{4,40}$/.test(id)) return null
  return (await storage().getItem<StoredRecord>(id)) ?? null
}

export async function saveStore(id: string, record: StoredRecord) {
  try {
    await storage().setItem(id, record)
  } catch (e) {
    console.error('[stores] save failed', e)
    throw createError({ statusCode: 503, statusMessage: "We couldn't save your page right now. Please try again in a minute." })
  }
}

export function tokenMatches(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
