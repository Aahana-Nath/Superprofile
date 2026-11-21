/**
 * Offline tests: no network, no API keys. Run with `npm test`.
 * The LLM is replaced with a fake via setLlmForTests, and Apify via a stubbed fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDocument } from '../server/pipeline/document'
import { autoNeedsConfirmation, sanitizeScored, verifyClaims } from '../server/pipeline/guards'
import { setLlmForTests } from '../server/pipeline/llm'
import { computeMetrics, detectCaptionScript } from '../server/pipeline/metrics'
import { pickPlaybook } from '../server/pipeline/playbooks'
import { FinalDocument, type FinalDocumentT } from '../server/pipeline/schemas'
import { classify, emptyProfile, fetchInstagramProfile, hasEnoughSignal, mapPost, normalizeHandle } from '../server/pipeline/scraper'
import * as sf from '../server/pipeline/storefront'

const fakePost = (i: number, caption = '5 exercises every beginner should know', likes = 500, comments = 20, type = 'Sidecar') => ({
  shortCode: `abc${i}`, type, caption, hashtags: ['fitness'], likesCount: likes, commentsCount: comments, timestamp: '2026-11-01T10:00:00.000Z',
})
const json = (v: unknown) => JSON.stringify(v)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

afterEach(() => {
  setLlmForTests(null)
  vi.unstubAllGlobals()
})

describe('handles', () => {
  it('accepts common forms', () => {
    for (const raw of ['@aarav.fit', 'aarav.fit', ' https://www.instagram.com/aarav.fit/ ', 'instagram.com/aarav.fit?hl=en']) {
      expect(normalizeHandle(raw)).toBe('aarav.fit')
    }
  })
  it('rejects invalid input', () => {
    for (const raw of ['', '   ', 'hello world', '@@@', '....', 'a'.repeat(31), 'बिना हैंडल']) expect(normalizeHandle(raw)).toBeNull()
  })
})

describe('metrics', () => {
  it('computes engagement', () => {
    const m = computeMetrics([{ likes: 1000, comments: 50, caption: '' }, { likes: 500, comments: 10, caption: '' }], 25000)
    expect(m.avg_likes).toBe(750)
    expect(m.engagement_rate).toBe(Math.round(((750 + 30) / 25000) * 100 * 100) / 100)
  })
  it('ignores hidden likes', () => {
    expect(computeMetrics([{ likes: null, comments: null, caption: '' }], 1000).engagement_rate).toBeNull()
  })
  it('detects caption script', () => {
    expect(detectCaptionScript(['Beginners ke liye ye 5 exercises zaroor karo, bahut kaam aayengi aur sab ke liye hai'])).toBe('hinglish')
    expect(detectCaptionScript(['Five simple exercises every beginner should learn before touching heavy weights'])).toBe('english')
    expect(detectCaptionScript(['शुरुआत करने वालों के लिए पांच आसान व्यायाम जो हर किसी को आने चाहिए'])).toBe('devanagari')
    expect(detectCaptionScript(['hi'])).toBe('unknown')
  })
})

describe('extraction status', () => {
  it('private', () => expect(classify({ private: true, followersCount: 5 }, [])[0]).toBe('private'))
  it('not found', () => expect(classify({ error: 'not_found' }, [])[0]).toBe('not_found'))
  it('stats only is partial', () => expect(classify({ followersCount: 731, error: 'could not fetch posts' }, [])[0]).toBe('partial'))
  it('failed without data', () => expect(classify({ error: 'boom' }, [])[0]).toBe('failed'))
  it('completed', () => {
    const posts = [1, 2, 3, 4, 5].map((i) => mapPost(fakePost(i), i))
    expect(classify({ followersCount: 100 }, posts)[0]).toBe('completed')
  })
})

describe('Apify fetch', () => {
  beforeEach(() => vi.stubEnv('APIFY_TOKEN', 'tok'))
  afterEach(() => vi.unstubAllEnvs())
  const run = (status = 200, payload: unknown = null, error?: Error) =>
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (error) throw error
      return new Response(json(payload), { status })
    }))

  it('happy path, capped at MAX_POSTS', async () => {
    run(200, [{
      username: 'someone', fullName: 'Some One', biography: 'Fitness coach for beginners', followersCount: 25000,
      followsCount: 100, postsCount: 300, isBusinessAccount: true, businessCategoryName: 'Personal Trainer',
      externalUrl: 'https://x.com', latestPosts: Array.from({ length: 14 }, (_, i) => fakePost(i + 1)),
    }])
    const ig = await fetchInstagramProfile('someone')
    expect(ig.extraction_status).toBe('completed')
    expect(ig.posts).toHaveLength(12)
    expect(ig.posts[0]!.id).toBe('p1')
    expect(ig.posts[0]!.type).toBe('carousel')
    expect(hasEnoughSignal(ig)).toBe(true)
  })
  it('empty result is not found', async () => {
    run(200, [])
    const ig = await fetchInstagramProfile('someone')
    expect(ig.extraction_status).toBe('not_found')
    expect(hasEnoughSignal(ig)).toBe(false)
  })
  it('timeout is failed', async () => {
    run(200, null, Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    expect((await fetchInstagramProfile('someone')).extraction_status).toBe('failed')
  })
  it('auth error is blocked', async () => {
    run(401, {})
    expect((await fetchInstagramProfile('someone')).extraction_status).toBe('blocked')
  })
  it('thin account has no signal', async () => {
    run(200, [{ username: 'someone', followersCount: 10, biography: '', latestPosts: [] }])
    expect(hasEnoughSignal(await fetchInstagramProfile('someone'))).toBe(false)
  })
})

describe('guards', () => {
  const BIO = 'Certified yoga instructor | 10+ years teaching | Helping beginners'
  it('accepts a verbatim claim', () => {
    const r = verifyClaims([{ claim: 'Certified yoga instructor', source: 'bio', quote: 'Certified yoga instructor' }], BIO, 'bio')
    expect([r.accepted.length, r.rejected.length]).toEqual([1, 0])
  })
  it('rejects an invented claim', () => {
    const r = verifyClaims([{ claim: 'Trained 5000 students', source: 'bio', quote: 'trained 5000 students' }], BIO, 'bio')
    expect([r.accepted.length, r.rejected.length]).toEqual([0, 1])
  })
  it('rejects a number not in the source', () => {
    const r = verifyClaims([{ claim: '15 years teaching', source: 'bio', quote: 'years teaching' }], BIO, 'bio')
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0]!.reason).toContain('15')
  })
  it('rejects the wrong source', () => {
    const r = verifyClaims([{ claim: 'Certified yoga instructor', source: 'user_input', quote: 'Certified yoga instructor' }], BIO, 'bio')
    expect(r.rejected).toHaveLength(1)
  })
  it('sanitises fake evidence', () => {
    const s = sanitizeScored({ value: 'Fitness', confidence: 0.95, evidence: ['p99'] }, new Set(['bio', 'p1']))
    expect(s.evidence).toEqual([])
    expect(s.confidence).toBeLessThanOrEqual(0.5)
  })
  it('flags low-confidence fields', () => {
    const inf = { niche: { value: 'Fitness', confidence: 0.9 }, sub_niche: { value: 'x', confidence: 0.4 }, target_audience: { value: null, confidence: 0 } }
    expect(autoNeedsConfirmation(inf, [])).toEqual(['sub_niche', 'target_audience'])
  })
})

describe('profile step (fake LLM)', () => {
  const GOOD = {
    input_quality: 'ok', input_quality_note: null,
    niche: { value: 'Fitness', confidence: 0.95, evidence: ['bio', 'p1'] },
    sub_niche: { value: 'Beginner strength training', confidence: 0.9, evidence: ['p1'] },
    target_audience: { value: 'Fitness beginners', confidence: 0.9, evidence: ['p1'] },
    recurring_themes: ['Beginner workouts'], content_tone: ['educational'], output_language: 'english',
    credibility_claims: [
      { claim: '10+ years teaching', source: 'bio', quote: '10+ years teaching' },
      { claim: 'Won national gold', source: 'bio', quote: 'Won national gold' },
    ],
    needs_confirmation: [], unknown_fields: ['location'],
  }
  const ig = () => {
    const posts = [1, 2, 3, 4, 5].map((i) => mapPost(fakePost(i), i))
    return { ...emptyProfile('someone', 'completed'), bio: 'Certified yoga instructor | 10+ years teaching', follower_count: 25000, posts, derived_metrics: computeMetrics(posts, 25000) }
  }

  it('full Instagram path drops invented claims', async () => {
    setLlmForTests(() => '```json\n' + json(GOOD) + '\n```')
    const doc = await buildDocument('instagram', ig())
    expect(doc.manual_data).toBeNull()
    expect(doc.credibility_claims).toHaveLength(1)
    expect(doc.gaps.rejected_claims).toHaveLength(1)
    expect(doc.quality_control.inference_status).toBe('ok')
    expect(['low', 'medium', 'high']).toContain(doc.inferred.engagement_level)
  })
  it('retries once, then succeeds', async () => {
    const replies = ['not json at all', json(GOOD)]
    setLlmForTests(() => replies.shift()!)
    expect((await buildDocument('instagram', ig())).quality_control.llm_attempts).toBe(2)
  })
  it('falls back when the LLM is down', async () => {
    setLlmForTests(() => { throw new Error('API down') })
    const doc = await buildDocument('instagram', ig())
    expect(doc.quality_control.inference_status).toBe('fallback')
    expect(doc.inferred.niche.value).toBeNull()
    expect(doc.gaps.needs_confirmation).toContain('niche')
  })
  it("the creator's language outranks inference", async () => {
    setLlmForTests(() => json(GOOD))
    const doc = await buildDocument('manual', null, {
      description: 'I teach UPSC prep to working professionals', audience: null, follower_range: 'none',
      language: 'hinglish', credibility: null, existing_prices: null,
    })
    expect(doc.inferred.output_language).toBe('hinglish')
    expect(doc.instagram_data).toBeNull()
    expect(doc.inferred.engagement_level).toBe('unknown')
  })
})

const DOC: FinalDocumentT = FinalDocument.parse({
  input_method: 'manual',
  generated_at: '2026-11-20T00:00:00+00:00',
  instagram_data: null,
  manual_data: { description: 'I teach UPSC prep to working professionals', audience: null, follower_range: 'none', language: 'english', credibility: null, existing_prices: null },
  inferred: {
    niche: { value: 'Exam Prep', confidence: 0.9, evidence: ['description'] },
    sub_niche: { value: 'UPSC for working professionals', confidence: 0.9, evidence: ['description'] },
    target_audience: { value: 'working professionals', confidence: 0.9, evidence: ['description'] },
    recurring_themes: [], content_tone: [], output_language: 'english', engagement_level: 'unknown',
  },
  credibility_claims: [],
  gaps: { unknown_fields: [], needs_confirmation: [], rejected_claims: [] },
  quality_control: { llm_provider: 'x', llm_model: 'x', llm_attempts: 1, inference_status: 'ok' },
})
const product = (format = 'ebook', price = 199, description = 'A short guide for busy professionals preparing for UPSC.') => ({
  format, title: 'UPSC Starter Guide', description, price_inr: price, price_rationale: `₹${price} is an easy first purchase.`, cta: 'Get it',
})
const store = (over: Record<string, unknown> = {}) => json({
  headline: 'UPSC prep that fits your workday', bio: 'I help working professionals prepare for UPSC.',
  products: [product(), product('one_on_one', 499)], ...over,
})

describe('storefront step (fake LLM)', () => {
  it('price bands shrink for small audiences', () => {
    const small = sf.allowedPrices('none')
    const big = sf.allowedPrices('100k_plus')
    expect(Math.max(...small.cohort_course!)).toBeLessThan(Math.max(...big.cohort_course!))
    expect(big.ebook!.every((p) => sf.CHARM_PRICES.includes(p))).toBe(true)
  })
  it('happy path', async () => {
    setLlmForTests(() => store())
    const out = await sf.generateStorefront(DOC)
    expect(out.products).toHaveLength(2)
    expect(out.products.every((p) => p.id.startsWith('p_'))).toBe(true)
    expect(out.generation.llm_attempts).toBe(1)
  })
  it('off-list price is retried, then snapped', async () => {
    const calls: string[] = []
    setLlmForTests((_s, u) => { calls.push(u); return store({ products: [product('ebook', 777), product('one_on_one', 499)] }) })
    const out = await sf.generateStorefront(DOC)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('not in the allowed list')
    const price = out.products[0]!.price_inr
    expect(sf.allowedPrices('none').ebook).toContain(price)
    expect(out.products[0]!.price_rationale).toContain(`₹${price}`)
    expect(out.generation.repaired).toBe(true)
  })
  it('removes invented numbers from the bio', async () => {
    setLlmForTests(() => store({ bio: 'I have taught 5000 students. I help working professionals prepare for UPSC.' }))
    const out = await sf.generateStorefront(DOC)
    expect(out.bio).not.toContain('5000')
    expect(out.bio).toContain('working professionals')
  })
  it('Devanagari in a Hinglish page triggers a retry', async () => {
    const bad = store({ products: [product('ebook', 199, 'Yeh guide उन professionals ke liye hai jo UPSC karna chahte hain.'), product('one_on_one', 499)] })
    const replies = [bad, store()]
    const calls: string[] = []
    setLlmForTests((_s, u) => { calls.push(u); return replies.shift()! })
    await sf.generateStorefront(DOC, { language: 'hinglish' })
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('Roman script')
  })
  it('total failure raises StorefrontError', async () => {
    setLlmForTests(() => { throw new Error('API down') })
    await expect(sf.generateStorefront(DOC)).rejects.toBeInstanceOf(sf.StorefrontError)
  })
  it('regenerating a product keeps its id', async () => {
    setLlmForTests(() => json(product('template_pack', 149)))
    const out = await sf.regenerateSection(DOC, { language: 'english', products: [{ id: 'p_keep', format: 'ebook', title: 'Old', price_inr: 199 }] }, 'product', 0)
    expect(out.result.id).toBe('p_keep')
    expect((out.result as { format: string }).format).toBe('template_pack')
  })
  it('a skipped audience size uses the description', () => {
    expect(sf.followersFromText('I have 30k followers who love treks')).toBe(30_000)
    expect(sf.followersFromText('1.2 lakh subscribers on YouTube')).toBe(120_000)
    expect(sf.followersFromText('5,000 followers')).toBe(5_000)
    expect(sf.followersFromText('I bake sourdough at home')).toBeNull()
    const d = clone(DOC)
    d.manual_data!.follower_range = 'unknown'
    d.manual_data!.description = 'I travel on a budget and share tips with my 40k followers'
    expect(sf.audienceTier(d)).toBe('25k_100k')
    d.manual_data!.description = 'I travel on a budget and share tips'
    expect(sf.audienceTier(d)).toBe('under_5k')
    d.manual_data!.follower_range = '100k_plus'
    expect(sf.audienceTier(d)).toBe('100k_plus')
  })
  it('language defaults to English, not the inferred language', async () => {
    const d = clone(DOC)
    d.inferred.output_language = 'hindi'
    ;(d.manual_data as { language: unknown }).language = null
    setLlmForTests(() => store())
    expect((await sf.generateStorefront(d)).language).toBe('english')
    expect((await sf.generateStorefront(d, { language: 'hinglish' })).language).toBe('hinglish')
  })
})

describe('creator-type playbooks', () => {
  const doc = (niche: string, sub = '', themes: string[] = [], bio?: string) => {
    const d = clone(DOC)
    d.inferred.niche.value = niche
    d.inferred.sub_niche.value = sub
    d.inferred.recurring_themes = themes
    if (bio !== undefined) d.manual_data!.description = bio
    return d
  }
  const causeReply = (recipient: string) => json({
    headline: 'Helping stray animals in Noida', bio: 'I rescue and care for stray animals in Noida.',
    products: [product('donation', 199), product('sponsorship', 499)],
    insights: ['Your rescue stories get the most love.'],
    pledge_recipient: recipient, pledge_purpose: 'food and vet care for rescued animals',
  })

  it('detects the creator type', () => {
    const cases: [string, FinalDocumentT][] = [
      ['cause', doc('Animal Welfare', 'Stray animal rescue', ['Fundraising for treatment'])],
      ['finance', doc('Personal Finance', 'Budgeting for students')],
      ['health', doc('Fitness', 'Home workouts for women')],
      ['education', doc('Exam Prep', 'UPSC for working professionals')],
      ['general', doc('Space & Astronomy', 'Galaxies', [], 'I post photos of the night sky')],
      ['general', doc('Travel', 'Budget Himalayan travel', ['Budget stays', 'Packing tips'], 'I travel on a budget and share homestays and taxi routes')],
    ]
    for (const [expected, d] of cases) expect(pickPlaybook(d)).toBe(expected)
  })
  it('donation formats are only offered to cause creators', () => {
    expect(sf.allowedPrices('5k_25k')).not.toHaveProperty('donation')
    expect(sf.allowedPrices('5k_25k', ['donation', 'sponsorship'])).toHaveProperty('donation')
  })
  it('a cause store gets an unconfirmed pledge', async () => {
    setLlmForTests(() => causeReply('Asha Foundation'))
    const out = await sf.generateStorefront(doc('Animal Welfare', 'Stray rescue', [], 'I run Asha Foundation and rescue stray animals in Noida'))
    expect(out.playbook.id).toBe('cause')
    expect(out.pledge).toMatchObject({ recipient: 'Asha Foundation', percent: 100, confirmed: false })
    expect(out.insights).toEqual(['Your rescue stories get the most love.'])
    expect(out.tips.length).toBeGreaterThan(0)
  })
  it('drops an organisation name the creator never wrote', async () => {
    setLlmForTests(() => causeReply('Helping Paws Trust'))
    const out = await sf.generateStorefront(doc('Animal Welfare', 'Stray rescue', [], 'I rescue stray animals in Noida'))
    expect(out.pledge!.recipient).toBeNull()
  })
  it('finance pages get a disclaimer in the page language', async () => {
    setLlmForTests(() => store())
    const out = await sf.generateStorefront(doc('Personal Finance', 'Budgeting'), { language: 'hinglish' })
    expect(out.pledge).toBeNull()
    expect(out.disclaimer).toContain('SEBI')
    expect(out.disclaimer).toContain('Sirf education')
  })
  it('the creator can override the type', async () => {
    setLlmForTests(() => store())
    const out = await sf.generateStorefront(doc('Fitness', 'Home workouts'), { playbookId: 'general' })
    expect(out.playbook.id).toBe('general')
    expect(out.disclaimer).toBeNull()
  })
})
