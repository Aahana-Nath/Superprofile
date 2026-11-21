import type { CreatorDocument, Store } from '~/types/pipeline'

export interface Draft {
  document: CreatorDocument | null
  store: Store | null
  publishedId: string | null
  editToken: string | null
  publishedSnapshot?: string | null
}

export const DRAFT_KEY = 'ai-storefront-draft'
export const emptyDraft = (): Draft => ({ document: null, store: null, publishedId: null, editToken: null })

/** The creator's work in progress. plugins/draft.client.ts keeps it in sessionStorage (this tab only). */
export function useDraft() {
  const draft = useState<Draft>('draft', emptyDraft)
  const reset = () => (draft.value = emptyDraft())
  return { draft, reset }
}

export function useToast() {
  const toast = useState<{ text: string; kind: 'error' | 'info'; id: number } | null>('toast', () => null)
  const show = (text: string, kind: 'error' | 'info' = 'info') => {
    const id = Date.now()
    toast.value = { text, kind, id }
    setTimeout(() => toast.value?.id === id && (toast.value = null), 4500)
  }
  return { toast, show }
}

export const errorMessage = (e: any) =>
  e?.data?.statusMessage || e?.statusMessage || 'Something went wrong. Please try again.'
