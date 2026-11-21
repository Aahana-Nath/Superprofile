/**
 * Niche playbooks: how the storefront should differ by creator type.
 * Picked in code from the inferred niche/themes (transparent and testable), overridable by the creator.
 * Each playbook can add product formats, steer the prompt, attach a trust note (pledge or disclaimer) and give tips.
 */
import type { FinalDocumentT } from './schemas'

export interface Playbook {
  label: string
  keywords: string[]
  extraFormats: string[]
  trustNote: 'pledge' | 'disclaimer' | null
  guidance: string
  tips: string[]
}

export const PLAYBOOKS: Record<string, Playbook> = {
  cause: {
    label: 'Social impact / NGO',
    keywords: ['welfare', 'ngo', 'non-profit', 'nonprofit', 'charity', 'foundation', 'rescue',
      'social work', 'social worker', 'volunteer', 'fundrais', 'donat', 'underprivileged',
      'stray', 'animal', 'relief', 'seva', 'community service', 'upliftment', 'orphan'],
    extraFormats: ['donation', 'sponsorship'],
    trustNote: 'pledge',
    guidance:
      "This creator runs a cause (social work, NGO, animal welfare or similar). Do not sell the cause like a " +
      "business. Make buying feel like supporting: include one 'support the work' contribution (format " +
      "donation) and one monthly sponsorship of something concrete (format sponsorship, e.g. 'feed a rescue " +
      "for a month'), plus one or two value products drawn from their real expertise (a care guide, a " +
      'volunteer training workshop). Avoid expensive 1:1 mentoring. Say plainly that the money supports the ' +
      'work. Never claim tax benefits (80G, 12A) or registration numbers unless the creator wrote them. ' +
      "Also return pledge_purpose (a short phrase of what the money pays for, e.g. 'food, vet care and " +
      "shelter for rescued animals') and pledge_recipient (the organisation name exactly as the creator " +
      'wrote it, or null).',
    tips: [
      'Say exactly where the money goes (food, vet bills, shelter) and post a short monthly update. Specific beats emotional.',
      'If your trust has 80G registration, add it: donors in India can claim a tax deduction, which lifts giving.',
      'Keep a low support amount (₹99 to ₹199) so students can chip in. Most donors start small and come back.',
    ],
  },
  finance: {
    label: 'Personal finance',
    keywords: ['finance', 'financial', 'invest', 'stock market', 'stocks', 'trading', 'mutual fund', 'income tax',
      'tax saving', 'wealth', 'crypto', 'credit card', 'insurance', 'retirement', 'personal budgeting'],
    extraFormats: [],
    trustNote: 'disclaimer',
    guidance:
      "Teach, don't advise. No stock tips, guaranteed returns, or portfolio-advice products unless the creator " +
      'says they are SEBI-registered. Prefer budgeting templates, beginner courses and workshops.',
    tips: [
      "Keep the disclaimer on. Selling stock tips or portfolio advice needs SEBI registration; teaching concepts doesn't.",
      'Lead with a low-price starter (a budget template at ₹99 to ₹299). Finance audiences trust you after a small win.',
    ],
  },
  health: {
    label: 'Fitness and health',
    keywords: ['fitness', 'workout', 'gym', 'yoga', 'diet', 'nutrition', 'weight', 'health', 'wellness', 'physio'],
    extraFormats: [],
    trustNote: 'disclaimer',
    guidance:
      'No medical claims, cures or guaranteed weight loss. Prefer structured programs, plans and form-check ' +
      'or diet-review calls.',
    tips: [
      "Describe what people will do each week rather than promising results like 'lose 10 kg'.",
      '1:1 diet or form-check calls are your highest-trust offer. Cap the slots to keep quality high.',
    ],
  },
  education: {
    label: 'Education and exam prep',
    keywords: ['exam', 'upsc', 'neet', 'jee', 'cat ', 'gate', 'ssc', 'study', 'tutor', 'teacher', 'coaching', 'school', 'college'],
    extraFormats: [],
    trustNote: null,
    guidance: 'Prefer notes, mock-test packs, cohort batches and doubt-solving calls. Tie offers to exam timelines.',
    tips: [
      'Time launches to the exam calendar. Students buy 6 to 10 weeks before an exam.',
      'Offer a cheap sample (one chapter, one mock test) to prove quality before the bigger product.',
    ],
  },
  general: {
    label: 'General creator',
    keywords: [],
    extraFormats: [],
    trustNote: null,
    guidance: '',
    tips: [
      "Put your lowest-price product first. It's the easiest first purchase.",
      'Pin your store link on your most-viewed reel, not just in your bio.',
    ],
  },
}

const ORDER = ['cause', 'finance', 'health', 'education']

const DISCLAIMERS: Record<string, Record<string, string>> = {
  finance: {
    english: 'For education only. This is not investment advice; do your own research or consult a SEBI-registered adviser.',
    hinglish: 'Sirf education ke liye. Yeh investment advice nahi hai; apna research karein ya SEBI-registered adviser se baat karein.',
    hindi: 'केवल शिक्षा के लिए। यह निवेश सलाह नहीं है; अपना शोध करें या SEBI-पंजीकृत सलाहकार से बात करें।',
  },
  health: {
    english: 'General guidance only, not medical advice. If you have a health condition, check with a doctor before starting.',
    hinglish: 'Yeh general guidance hai, medical advice nahi. Koi health condition ho toh shuru karne se pehle doctor se poochein.',
    hindi: 'यह सामान्य मार्गदर्शन है, चिकित्सा सलाह नहीं। कोई स्वास्थ्य समस्या हो तो शुरू करने से पहले डॉक्टर से पूछें।',
  },
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const count = (pattern: RegExp, text: string) => (text.match(pattern) || []).length

function profileText(doc: FinalDocumentT) {
  const inf = doc.inferred
  const parts: (string | null | undefined)[] = [inf.niche.value, inf.sub_niche.value, inf.target_audience.value, ...inf.recurring_themes]
  if (doc.instagram_data) parts.push(doc.instagram_data.bio, doc.instagram_data.business_category)
  if (doc.manual_data) parts.push(doc.manual_data.description, doc.manual_data.audience)
  return parts.filter(Boolean).join(' ').toLowerCase()
}

/** Scores each playbook by keyword hits in the niche (weighted x3) and the rest of the profile. */
export function pickPlaybook(doc: FinalDocumentT): string {
  const inf = doc.inferred
  const niche = [inf.niche.value, inf.sub_niche.value].filter(Boolean).join(' ').toLowerCase()
  const text = profileText(doc)
  let best = 'general'
  let bestScore = 0
  for (const pid of ORDER) {
    let score = 0
    for (const kw of PLAYBOOKS[pid]!.keywords) {
      const re = new RegExp(`\\b${escapeRe(kw.trim())}`, 'g')
      score += 3 * count(re, niche) + count(re, text)
    }
    if (score > bestScore) {
      best = pid
      bestScore = score
    }
  }
  return best
}

export const playbook = (pid: string): Playbook => PLAYBOOKS[pid] ?? PLAYBOOKS.general!

export function disclaimer(pid: string, language: string): string | null {
  const texts = DISCLAIMERS[pid]
  return texts ? texts[language] ?? texts.english! : null
}
