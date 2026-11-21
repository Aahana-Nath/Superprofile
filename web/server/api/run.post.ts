const FOLLOWERS = ['none', 'under_5k', '5k_25k', '25k_100k', '100k_plus']

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (body?.mode === 'instagram') {
    const handle = text(body.handle, 100)
    if (!handle) throw createError({ statusCode: 400, statusMessage: 'Enter an Instagram handle.' })
    return runPipeline(event, { mode: 'instagram', handle })
  }

  if (body?.mode === 'manual') {
    const m = body.manual ?? {}
    return runPipeline(event, {
      mode: 'manual',
      manual: {
        description: text(m.description, 2000),
        audience: text(m.audience, 500),
        credibility: text(m.credibility, 1000),
        existing_prices: text(m.existing_prices, 1000),
        follower_range: FOLLOWERS.includes(m.follower_range) ? m.follower_range : 'unknown',
        language: LANGUAGES.includes(m.language) ? m.language : 'english',
      },
    })
  }

  throw createError({ statusCode: 400, statusMessage: "mode must be 'instagram' or 'manual'" })
})
