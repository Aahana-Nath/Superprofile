# SuperProfile Storefront

Turns a creator's Instagram handle, or a line about what they do, into a ready-to-share storefront: an AI-written bio,
2 to 4 product ideas with India-appropriate INR prices, and a public page they can edit and publish.

One Nuxt 4 app (Vue front end + Nitro server routes). Deploys to Vercel as a single project.

```
handle ──> Apify scrape ──> metrics (code) ──┐
                │ private / not found / thin  │
                └──> "Describe myself" form ──┴──> LLM #1: creator profile ──> guardrails (code)
                                                        │
              editor (tap to edit, ↻ per section) <── LLM #2: storefront ──> price bands + checks (code)
                                                        │
                                   publish ──> /s/<id> (public page, link preview)
```

## Run locally

```bash
npm install
cp .env.example .env   # add GEMINI_API_KEY (and APIFY_TOKEN for the Instagram path)
npm run dev            # http://localhost:3000
npm test               # 40 offline tests, no network or keys needed
```

## Deploy (Vercel)

1. Import the repo; Vercel detects Nuxt. No build settings to change.
2. Environment variables: `GEMINI_API_KEY`, `LLM_PROVIDER=gemini`, `APIFY_TOKEN`.
3. Storage for published pages: add **Upstash for Redis** from Vercel's Marketplace (free tier) and connect it to the
   project. It sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which the app picks up automatically.
4. Redeploy.

## How it fits together

| Path | Role | LLM? |
|---|---|---|
| `server/pipeline/scraper.ts` | Apify call, field mapping, status (`completed/partial/private/not_found/blocked/failed`) | No |
| `server/pipeline/metrics.ts` | Avg likes/comments, engagement rate and level, caption script | No |
| `server/pipeline/inference.ts` | Profile prompt, parse, validate (zod), retry once, fallback | **Yes** |
| `server/pipeline/guards.ts` | Rejects invented credentials and fake evidence ids, flags low confidence | No |
| `server/pipeline/storefront.ts` | Storefront prompt; INR price bands; number, script and pledge checks; repairs | **Yes** |
| `server/pipeline/playbooks.ts` | Creator types (cause/NGO, finance, health, education, general) and their rules | No |
| `server/pipeline/schemas.ts` | Zod schemas for LLM output and the creator profile | No |
| `server/api/*` | `run` (step 1), `store/generate`, `store/regenerate`, `store/publish`, `store/[id]` | |
| `server/plugins/storage.ts` | Upstash Redis in production, local files in dev | |
| `app/` | Start page, editor (`/edit`), public page (`/s/<id>`) | |

### AI quality control

- **Structured output only:** both calls return JSON validated with zod; one retry with the exact error, then a fallback
  (profile) or a friendly error (storefront). No mocked or pre-written content.
- **Prices:** each format has an INR band narrowed by audience size; the model must pick from a list of familiar price
  points. Off-list prices are retried, then snapped, and the "why ₹X?" note is updated to match.
- **No invented facts:** credential claims need a verbatim quote from the creator's own text; numbers in the
  headline and bio must appear there too; English and Hinglish must be in Roman script.
- **Creator types:** cause creators get donation and sponsorship formats and an impact pledge (the org name is kept
  only if the creator wrote it, and publishing needs their confirmation); finance and health pages get a disclaimer.
- **The creator approves:** product ideas start un-added; only what they add goes on the published page.

## Notes

- `engagement_level` thresholds in `metrics.ts` are rough benchmarks; tune them with real data.
- The scraper only reads public data. The official Instagram API (OAuth) is the production route.
- Drafts live in the browser tab (sessionStorage); nothing about a run is stored until the creator publishes.
