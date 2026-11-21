// The draft lives only for this browser tab (sessionStorage): a refresh mid-edit keeps your work,
// but a new visit always starts fresh. Previous runs are never kept across visits.
export default defineNuxtPlugin(() => {
  const { draft } = useDraft()
  localStorage.removeItem(DRAFT_KEY) // clear drafts saved by older versions that persisted across visits
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
    if (saved) draft.value = { ...emptyDraft(), ...saved }
  } catch {}
  watch(draft, (v) => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(v)), { deep: true })
})
