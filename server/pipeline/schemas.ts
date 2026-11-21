/**
 * Zod schemas.
 * 1. InferenceOutput: what we ask the LLM to return (validated, retried on failure)
 * 2. FinalDocument: the complete creator profile the app works with (validated before use)
 */
import { z } from 'zod'

const nullable = <T extends z.ZodTypeAny>(t: T) => t.nullish().transform((v) => (v ?? null) as z.output<T> | null)
const list = <T extends z.ZodTypeAny>(t: T) => z.array(t).nullish().transform((v) => (v ?? []) as z.output<T>[])
const int = z.coerce.number().int()

export const ExtractionStatus = z.enum(['completed', 'partial', 'private', 'not_found', 'blocked', 'failed'])
export const Language = z.enum(['english', 'hinglish', 'hindi'])
export const FollowerRange = z.enum(['unknown', 'none', 'under_5k', '5k_25k', '25k_100k', '100k_plus'])
export const EngagementLevel = z.enum(['low', 'medium', 'high', 'unknown'])
const InputQuality = z.enum(['ok', 'too_vague', 'gibberish'])

// ---------- 1. LLM output ----------
export const Scored = z.object({
  value: nullable(z.string()),
  confidence: z.coerce.number().min(0).max(1).default(0),
  evidence: list(z.string()),
})

export const ClaimFromLLM = z.object({
  claim: z.string(),
  source: z.enum(['bio', 'user_input']),
  quote: z.string(), // must be copied verbatim from the source text; checked in code
})

export const InferenceOutput = z.object({
  input_quality: InputQuality.default('ok'),
  input_quality_note: nullable(z.string()),
  niche: Scored,
  sub_niche: Scored,
  target_audience: Scored,
  recurring_themes: list(z.string()),
  content_tone: list(z.string()),
  output_language: Language,
  credibility_claims: list(ClaimFromLLM),
  needs_confirmation: list(z.string()),
  unknown_fields: list(z.string()),
})

// ---------- 2. Final document ----------
export const Post = z.object({
  id: z.string(),
  type: z.enum(['carousel', 'reel', 'image', 'unknown']).default('unknown'),
  caption: z.string().nullish().transform((v) => v ?? ''),
  hashtags: list(z.string()),
  likes: nullable(int),
  comments: nullable(int),
  transcript: nullable(z.string()),
  url: nullable(z.string()),
  image_url: nullable(z.string()), // post thumbnail; used for cover banner / product photos
  posted_at: nullable(z.string()),
})

export const DerivedMetrics = z.object({
  posts_analyzed: int.default(0),
  avg_likes: z.coerce.number().default(0),
  avg_comments: z.coerce.number().default(0),
  engagement_rate: nullable(z.coerce.number()), // percent of followers
  caption_script: z.enum(['english', 'devanagari', 'hinglish', 'unknown']).default('unknown'),
})

export const InstagramData = z.object({
  username: z.string(),
  provider: z.string().default('apify'),
  extraction_status: ExtractionStatus,
  extracted_at: z.string(),
  error_detail: nullable(z.string()),
  display_name: nullable(z.string()),
  bio: nullable(z.string()),
  profile_image_url: nullable(z.string()),
  follower_count: nullable(int),
  following_count: nullable(int),
  post_count: nullable(int),
  is_verified: z.boolean().default(false),
  is_private: z.boolean().default(false),
  is_business_account: z.boolean().default(false),
  business_category: nullable(z.string()),
  external_link: nullable(z.string()),
  posts: list(Post),
  derived_metrics: DerivedMetrics.default({
    posts_analyzed: 0, avg_likes: 0, avg_comments: 0, engagement_rate: null, caption_script: 'unknown',
  }),
})

export const ManualData = z.object({
  description: z.string(),
  audience: nullable(z.string()),
  follower_range: FollowerRange.default('unknown'), // "unknown" = creator skipped it; inferred from the description
  language: Language.default('english'),
  credibility: nullable(z.string()),
  existing_prices: nullable(z.string()),
})

export const FinalDocument = z.object({
  input_method: z.enum(['instagram', 'manual']),
  generated_at: z.string(),
  instagram_data: nullable(InstagramData),
  manual_data: nullable(ManualData),
  inferred: z.object({
    niche: Scored,
    sub_niche: Scored,
    target_audience: Scored,
    recurring_themes: list(z.string()),
    content_tone: list(z.string()),
    output_language: Language,
    engagement_level: EngagementLevel.default('unknown'), // computed in code, not by the LLM
  }),
  credibility_claims: list(ClaimFromLLM),
  gaps: z.object({
    unknown_fields: list(z.string()),
    needs_confirmation: list(z.string()),
    rejected_claims: list(z.record(z.string(), z.any())), // claims that failed the source check
  }),
  quality_control: z.object({
    llm_provider: z.string(),
    llm_model: z.string(),
    llm_attempts: int,
    inference_status: z.enum(['ok', 'fallback']),
    input_quality: InputQuality.default('ok'),
    input_quality_note: nullable(z.string()),
    latency_seconds: z.coerce.number().default(0),
    last_error: nullable(z.string()),
  }),
})

export type FinalDocumentT = z.output<typeof FinalDocument>
export type InstagramDataT = z.output<typeof InstagramData>
export type ManualDataT = z.output<typeof ManualData>
export type PostT = z.output<typeof Post>

/** Short, single-line description of a validation error, suitable for feeding back to the model. */
export function zodMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ')
  }
  return String((e as Error)?.message ?? e)
}
