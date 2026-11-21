export default defineEventHandler(async (event) => {
  const body = requireObject(await readBody(event), 'request body')
  const clean = cleanStore(requireObject(body.store, 'store'))
  const now = new Date().toISOString()

  const id = text(body.id, 40)
  const token = text(body.editToken, 100)
  if (id) {
    const existing = await getStore(id)
    if (!existing || !token || !tokenMatches(token, existing.editToken)) {
      throw createError({ statusCode: 403, statusMessage: "You can't edit this page from this device." })
    }
    // If a source image can't be fetched any more (expired CDN link), keep the copy we already have.
    const keep = (chosen: string | null, cached: string | null, previous: string | null | undefined) =>
      cached ?? (chosen ? (previous ?? null) : null)
    const avatar = keep(clean.avatar_url, await cacheImage(id, 'avatar', clean.avatar_url), existing.store.avatar_url)
    const cover = keep(clean.cover_url, await cacheImage(id, 'cover', clean.cover_url), existing.store.cover_url)
    const products = await Promise.all(
      clean.products.map(async (p) => {
        const previous = existing.store.products.find((x) => x.id === p.id)?.image_url
        return { ...p, image_url: keep(p.image_url, await cacheImage(id, `prod-${p.id}`, p.image_url), previous) }
      }),
    )
    const store = { ...clean, products, avatar_url: avatar, cover_url: cover, id, published_at: existing.store.published_at, updated_at: now }
    await saveStore(id, { store, editToken: existing.editToken })
    return { id, editToken: existing.editToken }
  }

  const storeId = newId(6)
  const editToken = newId(24)
  const avatar_url = await cacheImage(storeId, 'avatar', clean.avatar_url)
  const cover_url = await cacheImage(storeId, 'cover', clean.cover_url)
  const products = await Promise.all(
    clean.products.map(async (p) => ({ ...p, image_url: await cacheImage(storeId, `prod-${p.id}`, p.image_url) })),
  )
  await saveStore(storeId, {
    store: { ...clean, products, avatar_url, cover_url, id: storeId, published_at: now, updated_at: now },
    editToken,
  })
  return { id: storeId, editToken }
})
