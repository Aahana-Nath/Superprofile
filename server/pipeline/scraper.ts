/**
 * Instagram fetch layer (Apify). No LLM here.
 * The actor's field names can drift, so every read goes through get(...), which tries several known names.
 */
import { settings } from './config'
import { computeMetrics } from './metrics'

const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/

/** '@aarav.fit', 'instagram.com/aarav.fit/', 'aarav.fit' -> 'aarav.fit'. Invalid -> null. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.trim()
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/)
  if (m) s = m[1]!
  s = s.replace(/^@+/, '').trim().replace(/^\/+|\/+$/g, '')
  if (!HANDLE_RE.test(s) || /^\.+$/.test(s)) return null
  return s
}

function get(d: any, ...keys: string[]): any {
  for (const k of keys) if (d && typeof d === 'object' && d[k] != null) return d[k]
  return undefined
}

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00')

export function emptyProfile(handle: string, status: string, detail: string | null = null) {
  return {
    username: `@${handle}`,
    provider: 'apify',
    extraction_status: status,
    extracted_at: now(),
    error_detail: detail,
    display_name: null as string | null,
    bio: null as string | null,
    profile_image_url: null as string | null,
    follower_count: null as number | null,
    following_count: null as number | null,
    post_count: null as number | null,
    is_verified: false,
    is_private: false,
    is_business_account: false,
    business_category: null as string | null,
    external_link: null as string | null,
    posts: [] as ReturnType<typeof mapPost>[],
    derived_metrics: computeMetrics([], null),
  }
}
export type InstagramProfile = ReturnType<typeof emptyProfile>

export function mapPost(p: any, index: number) {
  const t = String(get(p, 'type') ?? '').toLowerCase()
  const product = String(get(p, 'productType') ?? '').toLowerCase()
  const type = t.includes('sidecar') || t.includes('carousel') ? 'carousel'
    : t.includes('video') || t.includes('reel') || product === 'clips' ? 'reel'
      : t.includes('image') ? 'image' : 'unknown'
  const num = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null) // -1 = hidden likes
  const hashtags: unknown[] = get(p, 'hashtags') || []
  const images: unknown[] = get(p, 'images') || []
  const image = get(p, 'displayUrl', 'display_url', 'thumbnailUrl', 'thumbnail_src', 'imageUrl', 'image_url')
    ?? (typeof images[0] === 'string' ? images[0] : null)
  return {
    id: `p${index}`,
    type,
    caption: String(get(p, 'caption') ?? '').trim(),
    hashtags: hashtags.map((h) => (String(h).startsWith('#') ? String(h) : `#${h}`)),
    likes: num(get(p, 'likesCount', 'likes')),
    comments: num(get(p, 'commentsCount', 'comments')),
    transcript: null as string | null,
    url: get(p, 'url') ?? (p?.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null),
    image_url: typeof image === 'string' && image.startsWith('https://') ? image : null,
    posted_at: get(p, 'timestamp', 'takenAt') ?? null,
  }
}

/** Decide extraction_status from one actor item. */
export function classify(item: any, posts: unknown[]): [string, string | null] {
  const err = String(get(item, 'error', 'errorMessage', 'errorDescription') ?? '')
  const errL = err.toLowerCase()
  const followers = get(item, 'followersCount', 'followers')
  const isPrivate = Boolean(get(item, 'private', 'isPrivate'))
  if (isPrivate || errL.includes('private')) return ['private', err || 'Account is private']
  if (err && ['not_found', 'not found', 'does not exist', "doesn't exist", '404', 'no profile'].some((k) => errL.includes(k))) {
    return ['not_found', err]
  }
  if (err && followers == null) return ['failed', err]
  if (err && !posts.length) return ['partial', err] // profile numbers came back, but no content
  if (posts.length >= 3) return ['completed', null]
  return ['partial', err || 'Fewer than 3 public posts available']
}

/** Calls the Apify actor synchronously. Never throws: failures become a status. */
export async function fetchInstagramProfile(handle: string): Promise<InstagramProfile> {
  const s = settings()
  if (!s.apifyToken) return emptyProfile(handle, 'failed', 'APIFY_TOKEN is not set')

  const url = new URL(`https://api.apify.com/v2/acts/${s.apifyActor}/run-sync-get-dataset-items`)
  url.searchParams.set('token', s.apifyToken)
  url.searchParams.set('timeout', String(Math.max(s.scrapeTimeout - 10, 20)))

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usernames: [handle] }),
      signal: AbortSignal.timeout(s.scrapeTimeout * 1000),
    })
  } catch (e: any) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    return emptyProfile(handle, 'failed', timedOut ? 'Scraper timed out' : `Network error: ${e?.message ?? e}`)
  }

  if ([401, 403, 429].includes(res.status)) return emptyProfile(handle, 'blocked', `Apify returned HTTP ${res.status}`)
  if (res.status !== 200 && res.status !== 201) {
    return emptyProfile(handle, 'failed', `Apify returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  let items: any
  try {
    items = await res.json()
  } catch {
    return emptyProfile(handle, 'failed', 'Scraper returned invalid JSON')
  }
  if (!Array.isArray(items) || !items.length) return emptyProfile(handle, 'not_found', 'Scraper returned no data for this handle')

  const item = items[0]
  const rawPosts: unknown[] = get(item, 'latestPosts', 'posts') || []
  const posts = rawPosts
    .slice(0, s.maxPosts)
    .map((p, i) => (p && typeof p === 'object' ? mapPost(p, i + 1) : null))
    .filter((p): p is ReturnType<typeof mapPost> => !!p)
  const [status, detail] = classify(item, posts)
  const followers = get(item, 'followersCount', 'followers') ?? null

  return {
    ...emptyProfile(handle, status, detail),
    username: `@${get(item, 'username') ?? handle}`,
    display_name: get(item, 'fullName', 'full_name') ?? null,
    bio: get(item, 'biography', 'bio') ?? null,
    profile_image_url: get(item, 'profilePicUrlHD', 'profilePicUrl', 'profile_pic_url') ?? null,
    follower_count: followers,
    following_count: get(item, 'followsCount', 'followingCount', 'following') ?? null,
    post_count: get(item, 'postsCount', 'mediaCount') ?? null,
    is_verified: Boolean(get(item, 'verified', 'isVerified')),
    is_private: status === 'private',
    is_business_account: Boolean(get(item, 'isBusinessAccount', 'businessAccount')),
    business_category: get(item, 'businessCategoryName', 'categoryName') ?? null,
    external_link: get(item, 'externalUrl', 'external_url') ?? null,
    posts,
    derived_metrics: computeMetrics(posts, followers),
  }
}

/** Even a completed/partial fetch may be too thin to infer a niche from. */
export function hasEnoughSignal(ig: InstagramProfile) {
  if (!['completed', 'partial'].includes(ig.extraction_status)) return false
  const bioLen = (ig.bio || '').trim().length
  const captions = ig.posts.filter((p) => p.caption.length >= 15).length
  return bioLen >= 10 || captions >= 1
}
