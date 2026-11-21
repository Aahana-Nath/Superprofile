/** Central settings, read from environment variables (Nuxt loads .env in dev; set them in the host for production). */

const int = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-3.5-flash-lite',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-5-5',
}

/** Read on every call so tests (and hosts) can change env without a restart. */
export function settings() {
  const llmProvider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase()
  return {
    apifyToken: process.env.APIFY_TOKEN || '',
    apifyActor: process.env.APIFY_ACTOR || 'grabd~instagram-profile-scraper',
    scrapeTimeout: int('SCRAPE_TIMEOUT_SECONDS', 90),
    maxPosts: int('MAX_POSTS', 12),
    llmProvider,
    llmModel: process.env.LLM_MODEL || DEFAULT_MODELS[llmProvider] || DEFAULT_MODELS.gemini!,
    llmTimeout: int('LLM_TIMEOUT_SECONDS', 60),
    geminiKey: process.env.GEMINI_API_KEY || '',
    openaiKey: process.env.OPENAI_API_KEY || '',
    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  }
}
