// Serves a published page's cached images: /api/store/<id>/avatar and /api/store/<id>/cover
export default defineEventHandler(async (event) => {
  const image = await getImage(getRouterParam(event, 'id') || '', getRouterParam(event, 'kind') || '')
  if (!image) throw createError({ statusCode: 404, statusMessage: 'No image' })
  setResponseHeaders(event, {
    'content-type': image.type,
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  })
  return Buffer.from(image.data, 'base64')
})
