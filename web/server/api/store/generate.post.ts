export default defineEventHandler(async (event) => {
  const body = requireObject(await readBody(event), 'request body')
  return runPipeline(event, {
    mode: 'storefront',
    document: requireObject(body.document, 'creator profile'),
    language: LANGUAGES.includes(body.language) ? body.language : undefined,
    name: text(body.name, 60) || undefined,
    instruction: text(body.instruction, 200) || undefined,
    playbook: PLAYBOOK_IDS.includes(body.playbook) ? body.playbook : undefined,
  })
})
