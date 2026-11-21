# Creator data pipeline

Takes an Instagram handle **or** a manual description and writes one complete, validated JSON file.
No storefront generation yet: this is the data layer.

```
handle ──> Apify scrape ──> metrics (code) ──> LLM inference ──> guardrails (code) ──> validate ──> output/*.json
              │ private / not found / blocked / thin
              └──────────> manual form ──────────────────────^
```

Exactly one of `instagram_data` / `manual_data` is filled in the output; the other is `null`.

## Setup (VS Code terminal)

```bash
cd storefront_data_pipeline
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
```

Open `.env` and add `APIFY_TOKEN` (Apify Console > Settings > API & Integrations) and either
`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (set `LLM_PROVIDER` to match).

## Run

```bash
python main.py                          # interactive
python main.py --handle @creator        # Instagram path
python main.py --manual                 # manual form
python main.py --manual --description "I teach UPSC prep to working professionals" --followers 5k_25k --language hinglish
```

The CLI (a developer tool) writes to `output/`; the web app never does:
- `<handle>_<time>.json`: the final document
- `<handle>_raw_apify_<time>.json`: the raw scraper response. **Open this first on your first run** to confirm the
  actor's field names match what `pipeline/scraper.py` reads (`latestPosts`, `biography`, `followersCount`, ...).
  If a name differs, add it to the matching `_get(...)` call.

## Web UI (Nuxt)

```bash
cd web
npm install
npm run dev                             # http://localhost:3000
```

Flow: `/` (handle or description) → profile + storefront generation → `/edit` (tap-to-edit store, per-section
rewrite, add/remove products, regenerate everything in English/Hinglish/Hindi, preview) → Publish → `/s/<id>`
(public page). Runs are not stored: nothing is written to `output/`, and the draft lives in sessionStorage, so it
survives a refresh but a new visit starts fresh. Publishing returns an edit token that only this tab holds.

- `pipeline/storefront.py`: LLM call #2. Writes headline, bio and 2-4 products. Prices must come from a per-format
  INR band narrowed by audience size (`FORMATS`, `TIER_CEILING`); off-list prices are retried, then snapped.
  Bio numbers must appear in the creator's own words, and English/Hinglish output must be Roman script.
- `web/server/api/*`: validate input and call `run_pipeline.py` (JSON stdin/stdout) with `../.venv/bin/python`.
  Override with `NUXT_PYTHON_BIN`, `NUXT_PIPELINE_DIR`, `NUXT_PIPELINE_TIMEOUT_MS`.
- Published stores are stored with Nitro storage in `web/.data/stores` (swap the driver in `nuxt.config.ts` to deploy).
- `pipeline/playbooks.py`: niche playbooks picked from the inferred niche (creator can override). Each one steers the
  prompt and can add formats, a trust note and tips:
  - `cause` (social workers, NGOs, animal welfare): adds `donation` and `sponsorship` formats and an impact pledge
    ("100% of every payment goes to <org>: <purpose>"). The org name is kept only if the creator wrote it, the sentence
    is rendered in code, and publishing is blocked until the creator ticks "I confirm this is true".
  - `finance` / `health`: a disclaimer in the page language (no SEBI-style advice, no medical claims).
  - `education`, `general`: prompt guidance and tips only.
  The LLM also returns 2-3 insights grounded in the creator's posts; insights and tips are shown only to the creator.

## Offline tests (no keys needed)

```bash
python -m unittest test_offline -v
```

## What does what

| File | Role | LLM? |
|---|---|---|
| `pipeline/scraper.py` | Apify call, field mapping, status (`completed/partial/private/not_found/blocked/failed`) | No |
| `pipeline/metrics.py` | avg likes/comments, engagement rate and level, caption script | No |
| `pipeline/inference.py` | Prompt, parse, validate, retry once, fallback | **Yes** |
| `pipeline/guards.py` | Rejects invented credentials, fake evidence ids, flags low confidence | No |
| `pipeline/document.py` | Assembles and schema-validates the final JSON | No |
| `pipeline/schemas.py` | Pydantic models for LLM output and the final document | No |

## Edge cases handled

- Invalid handle text, nonexistent account, private account, blocked or timed-out scraper: friendly message, then manual form
- Account with almost no public content: treated as insufficient, falls back to manual
- One-word or gibberish manual description: asks for more detail (local check, then the LLM's `input_quality`)
- LLM returns bad JSON or the API errors: one retry with the error message, then a fallback document with
  empty inferred fields flagged in `gaps.needs_confirmation`. The file is still written and valid.
- Credentials: a claim is kept only if its verbatim quote exists in the creator's own bio/text, and any number in it appears there too

## Things to know

- `engagement_level` thresholds in `metrics.py` are rough benchmarks. Tune them once you have real data.
- The scraper only reads public data. Mention in your decision doc that the official Instagram OAuth API is the production route.
- Default Anthropic model is `claude-sonnet-5-5`; override with `LLM_MODEL`.
- `LLM_PROVIDER=gemini` (default model `gemini-3.5-flash-lite`) reads its key from `GEMINI_API_KEY` (get one at Google AI Studio).
