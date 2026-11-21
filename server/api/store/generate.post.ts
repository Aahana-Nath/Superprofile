import { StorefrontError, generateStorefront } from '../../pipeline/storefront'

/** Step 2: creator profile -> full storefront. */
export default defineEventHandler(async (event) => {
  const body = requireObject(await readBody(event), 'request body')
  const doc = requireProfile(body.document)
  try {
    const store = await generateStorefront(doc, {
      language: LANGUAGES.includes(body.language) ? body.language : undefined,
      name: text(body.name, 60) || undefined,
      instruction: text(body.instruction, 200) || undefined,
      playbookId: PLAYBOOK_IDS.includes(body.playbook) ? body.playbook : undefined,
    })
    return { ok: true, store }
  } catch (e) {
    if (e instanceof StorefrontError) return fail('llm_failed', `We couldn't write your store this time (${e.message}). Please try again.`)
    throw e
  }
})
