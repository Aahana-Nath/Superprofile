import { StorefrontError, regenerateSection } from '../../pipeline/storefront'

const TARGETS = ['bio', 'product', 'new_product']

/** Rewrites one section: the bio, one product, or a new extra product. */
export default defineEventHandler(async (event) => {
  const body = requireObject(await readBody(event), 'request body')
  if (!TARGETS.includes(body.target)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown section to regenerate.' })
  }
  const doc = requireProfile(body.document)
  const store = requireObject(body.store, 'store')
  try {
    const out = await regenerateSection(
      doc,
      {
        name: text(store.name, 60),
        language: LANGUAGES.includes(store.language) ? store.language : undefined,
        playbook: PLAYBOOK_IDS.includes(store.playbook?.id) ? { id: store.playbook.id } : undefined,
        headline: text(store.headline, 140),
        bio: text(store.bio, 700),
        products: (Array.isArray(store.products) ? store.products : []).slice(0, 6).map((p: any) => ({
          id: text(p?.id, 20),
          format: text(p?.format, 30),
          title: text(p?.title, 100),
          description: text(p?.description, 800),
          price_inr: Number(p?.price_inr) || 0,
        })),
      },
      body.target,
      Number.isInteger(body.index) ? body.index : undefined,
      text(body.instruction, 200) || undefined,
    )
    return { ok: true, ...out }
  } catch (e) {
    if (e instanceof StorefrontError) return fail('llm_failed', `We couldn't rewrite that part (${e.message}). Please try again.`)
    throw e
  }
})
