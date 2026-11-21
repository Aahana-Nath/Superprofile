export default defineEventHandler(async (event) => {
  const record = await getStore(getRouterParam(event, 'id') || '')
  if (!record) throw createError({ statusCode: 404, statusMessage: 'Store not found' })
  return record.store
})
