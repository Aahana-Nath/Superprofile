/** Assembles the creator profile document and validates it. Exactly one of instagram_data / manual_data is set. */
import { infer } from './inference'
import { engagementLevel } from './metrics'
import { FinalDocument, type FinalDocumentT, type ManualDataT } from './schemas'
import type { InstagramProfile } from './scraper'

export async function buildDocument(
  method: 'instagram' | 'manual',
  ig?: InstagramProfile | null,
  manual?: ManualDataT | null,
): Promise<FinalDocumentT> {
  if (method === 'instagram' && !ig) throw new Error('instagram data required')
  if (method === 'manual' && !manual) throw new Error('manual data required')

  const result = await infer(method, ig, manual)

  // Engagement level is computed in code from real numbers, not guessed by the LLM.
  const eng = method === 'instagram' ? engagementLevel(ig!.derived_metrics.engagement_rate, ig!.follower_count) : 'unknown'

  const unknown = [...result.unknownFields]
  if (method === 'manual' && !manual!.existing_prices && !unknown.includes('existing_prices')) unknown.push('existing_prices')

  // Final structural validation: throws if anything is malformed, so callers never get a broken profile.
  return FinalDocument.parse({
    input_method: method,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00'),
    instagram_data: method === 'instagram' ? ig : null,
    manual_data: method === 'manual' ? manual : null,
    inferred: { ...result.inferredFields, engagement_level: eng },
    credibility_claims: result.claims,
    gaps: {
      unknown_fields: unknown,
      needs_confirmation: result.needsConfirmation,
      rejected_claims: result.rejectedClaims,
    },
    quality_control: result.qc,
  })
}
