export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  routeRules: {
    // The editor lives in the browser tab's storage, so render it on the client only.
    '/edit': { ssr: false },
  },
  app: {
    head: {
      title: 'SuperProfile Storefront',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  nitro: {
    // Instagram scraping can take up to ~90s; LLM calls a few seconds each.
    vercel: { functions: { maxDuration: 120 } },
  },
})
