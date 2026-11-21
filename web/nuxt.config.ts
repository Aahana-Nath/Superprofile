export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  routeRules: {
    // The editor lives in localStorage, so render it on the client only.
    '/edit': { ssr: false },
  },
  app: {
    head: {
      title: 'SuperProfile Storefront',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  runtimeConfig: {
    // Server-only. Override with NUXT_PYTHON_BIN / NUXT_PIPELINE_DIR / NUXT_PIPELINE_TIMEOUT_MS.
    pythonBin: '',
    pipelineDir: '',
    pipelineTimeoutMs: 180000,
  },
  nitro: {
    // Published stores. Local files for now; swap the driver (e.g. upstash) for deployment.
    storage: { stores: { driver: 'fs', base: './.data/stores' } },
    devStorage: { stores: { driver: 'fs', base: './.data/stores' } },
  },
})
