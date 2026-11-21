import fsDriver from 'unstorage/drivers/fs'
import upstashDriver from 'unstorage/drivers/upstash'

/**
 * Where published stores (and their images) live.
 * - Production: Upstash Redis. Vercel's Upstash integration sets KV_REST_API_URL/TOKEN;
 *   a plain Upstash database gives UPSTASH_REDIS_REST_URL/TOKEN. Either works.
 * - Local dev: files in ./.data/stores.
 */
export default defineNitroPlugin(() => {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  const storage = useStorage()
  if (url && token) {
    storage.mount('stores', upstashDriver({ url, token, base: 'stores' }))
  } else {
    if (process.env.VERCEL) console.warn('[storage] No Upstash/KV env vars set: published stores will not persist.')
    storage.mount('stores', fsDriver({ base: './.data/stores' }))
  }
})
