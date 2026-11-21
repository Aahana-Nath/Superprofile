/** Thin LLM wrapper: one function, three providers (plain fetch, no SDKs). Swap with LLM_PROVIDER. */
import { settings } from './config'

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutS: number) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutS * 1000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

/** Returns the model's raw text reply. Throws on API errors (callers retry). */
async function callLlmImpl(system: string, user: string): Promise<string> {
  const s = settings()

  if (s.llmProvider === 'openai') {
    if (!s.openaiKey) throw new Error('OPENAI_API_KEY is not set')
    const data = await post(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${s.openaiKey}` },
      {
        model: s.llmModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      },
      s.llmTimeout,
    )
    return data.choices?.[0]?.message?.content ?? ''
  }

  if (s.llmProvider === 'anthropic') {
    if (!s.anthropicKey) throw new Error('ANTHROPIC_API_KEY is not set')
    const data = await post(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': s.anthropicKey, 'anthropic-version': '2023-06-01' },
      { model: s.llmModel, max_tokens: 2000, system, messages: [{ role: 'user', content: user }] },
      s.llmTimeout,
    )
    return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  }

  // default: gemini
  if (!s.geminiKey) throw new Error('GEMINI_API_KEY is not set')
  const data = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${s.llmModel}:generateContent`,
    { 'x-goog-api-key': s.geminiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json' },
    },
    s.llmTimeout,
  )
  const parts = data.candidates?.[0]?.content?.parts
  if (!parts) throw new Error(`Gemini returned no content: ${JSON.stringify(data).slice(0, 200)}`)
  return parts.map((p: any) => p.text ?? '').join('')
}

// Indirection so tests can replace the model with a fake (see setLlmForTests).
let impl: (system: string, user: string) => Promise<string> = callLlmImpl
export const callLlm = (system: string, user: string) => impl(system, user)
export function setLlmForTests(fake: ((system: string, user: string) => Promise<string> | string) | null) {
  impl = fake ? async (s, u) => fake(s, u) : callLlmImpl
}

/** Strips code fences and pulls out the first {...} object. */
export function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?|```$/gm, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no JSON object found in reply')
  return JSON.parse(cleaned.slice(start, end + 1))
}
