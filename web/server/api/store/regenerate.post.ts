const TARGETS = ['bio', 'product', 'new_product']

export default defineEventHandler(async (event) => {
  const body = requireObject(await readBody(event), 'request body')
  if (!TARGETS.includes(body.target)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown section to regenerate.' })
  }
  const store = requireObject(body.store, 'store')
  return runPipeline(event, {
    mode: 'regenerate',
    document: requireObject(body.document, 'creator profile'),
    store: {
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
    target: body.target,
    index: Number.isInteger(body.index) ? body.index : undefined,
    instruction: text(body.instruction, 200) || undefined,
  })
})
