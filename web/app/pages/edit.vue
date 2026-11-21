<script setup lang="ts">
import type { GenerateResponse, Language, RegenerateResponse } from '~/types/pipeline'
import { FORMAT_LABELS, assignProductImages, formatOptionsFor, formatPrice } from '~/types/pipeline'

useHead({ title: 'Edit your store' })

const { draft, reset } = useDraft()
const { show } = useToast()

if (!draft.value.store || !draft.value.document) await navigateTo('/')

const store = computed(() => draft.value.store!)
const view = ref<'edit' | 'preview'>('edit')

// Phones: the desktop side panels slide in instead. ☰ opens "Build your page" (left), the sliders button opens
// "Edit page" (right). Esc closes them, and the page behind doesn't scroll while one is open.
const drawerOpen = ref(false)
const rightOpen = ref(false)
function closePanels() {
  drawerOpen.value = false
  rightOpen.value = false
}
function openLeftPanel() {
  view.value = 'edit'
  rightOpen.value = false
  drawerOpen.value = true
}
function openRightPanel() {
  view.value = 'edit'
  drawerOpen.value = false
  rightOpen.value = true
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closePanels()
}
watch(() => drawerOpen.value || rightOpen.value, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) document.addEventListener('keydown', onKey)
  else document.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKey)
})
const busy = ref<string | null>(null)
const publishing = ref(false)
const shareOpen = ref(false)
const suggestions = computed(() => [...(store.value?.insights || []), ...(store.value?.tips || [])])

// Language seen in the creator's posts, offered (never applied) when it differs from the page language.
const suggestedLanguage = computed(() => {
  const seen = draft.value.document?.inferred.output_language
  return seen && seen !== store.value?.language ? seen : null
})

async function switchLanguage(lang: Language) {
  closePanels()
  await regenerateAll(lang)
}

// ---- desktop workspace: left "Build your page" panels, right "Edit page" tabs ----
const leftPanel = ref<null | 'suggestions' | 'insights'>(null)
const RIGHT_TABS = [
  { id: 'content', label: 'Content' },
  { id: 'design', label: 'Design' },
  { id: 'sections', label: 'Sections' },
] as const
const rightTab = ref<(typeof RIGHT_TABS)[number]['id']>('content')
const suggestionCount = computed(() => suggestions.value.length + (suggestedLanguage.value ? 1 : 0))

// Left panel width: drag its edge, double-click it, use arrow keys, or the expand button.
// Remembered on this device as a UI preference (not part of any draft).
const LEFT_MIN = 260
const LEFT_MAX = 680
const LEFT_DEFAULT = 300
const LEFT_WIDE = 520
const leftWidth = ref(LEFT_DEFAULT)
const clampLeft = (w: number) =>
  Math.round(Math.max(LEFT_MIN, Math.min(w, LEFT_MAX, window.innerWidth - 340 - 420)))
// "wide" = noticeably wider than default (the max can be below LEFT_WIDE on smaller windows)
const leftWide = computed(() => leftWidth.value > LEFT_DEFAULT + 40)
onMounted(() => {
  const saved = Number(localStorage.getItem('ws-left-width'))
  if (saved) leftWidth.value = clampLeft(saved)
})
watch(leftWidth, (w) => localStorage.setItem('ws-left-width', String(w)))

function toggleLeftWidth() {
  leftWidth.value = clampLeft(leftWide.value ? LEFT_DEFAULT : LEFT_WIDE)
}
function startResize(e: PointerEvent) {
  const handle = e.currentTarget as HTMLElement
  const startX = e.clientX
  const startW = leftWidth.value
  handle.setPointerCapture(e.pointerId)
  document.body.classList.add('resizing')
  const move = (ev: PointerEvent) => (leftWidth.value = clampLeft(startW + ev.clientX - startX))
  const end = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    document.body.classList.remove('resizing')
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
}
function resizeKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 60 : 20
  const next = { ArrowLeft: leftWidth.value - step, ArrowRight: leftWidth.value + step, Home: LEFT_MIN, End: LEFT_MAX }[e.key]
  if (next === undefined) return
  e.preventDefault()
  leftWidth.value = clampLeft(next)
}
const leadProduct = computed(() => store.value?.products.find((p) => p.added) ?? store.value?.products[0] ?? null)
const isDesktop = () => window.matchMedia('(min-width: 1100px)').matches

/** Scroll only inside a side panel (scrollIntoView would also scroll the page behind it). */
function scrollPanelTo(panelSelector: string, targetSelector: string) {
  const panel = document.querySelector<HTMLElement>(panelSelector)
  const el = panel?.querySelector<HTMLElement>(targetSelector)
  if (!panel || !el) return
  const top = el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 16
  panel.scrollTo({ top, behavior: 'smooth' })
}

/** "Change cover" / camera button: the right panel's Design tab (slid in on phones). */
async function openDesign(section: 'cover' | 'avatar') {
  rightTab.value = 'design'
  if (!isDesktop()) openRightPanel()
  await nextTick()
  scrollPanelTo('.ws-right', `#design-${section}`)
  // keep the page on the cover/photo being changed
  if (isDesktop()) window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Left nav "Design" card: switch the right panel to its Design tab. */
function goDesignTab() {
  rightTab.value = 'design'
  if (!isDesktop()) openRightPanel()
}

/** Content rows jump to the matching part of the page and put the cursor in it. */
function focusField(name: string) {
  view.value = 'edit'
  closePanels()
  nextTick(() => {
    const el = document.querySelector<HTMLElement>(`.editor-main [data-field="${name}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const input = el.matches('textarea, input') ? el : el.querySelector<HTMLElement>('textarea, input')
    input?.focus({ preventScroll: true })
    el.classList.add('flash')
    setTimeout(() => el.classList.remove('flash'), 1200)
  })
}

// "Draft saved · just now": the draft is saved to this tab's storage on every change.
const savedAt = ref(Date.now())
const now = ref(Date.now())
watch(() => draft.value.store, () => (savedAt.value = Date.now()), { deep: true })
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 30_000)))
onBeforeUnmount(() => clearInterval(clock))
const savedLabel = computed(() => {
  const mins = Math.floor((now.value - savedAt.value) / 60_000)
  return mins < 1 ? 'just now' : `${mins} min ago`
})

const MAX_IN_STORE = 4
const MAX_IDEAS = 6
const addedCount = computed(() => store.value?.products.filter((p) => p.added).length ?? 0)

const igData = computed(() => draft.value.document?.instagram_data ?? null)
const feed = computed(() =>
  [...(igData.value?.posts ?? [])]
    .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
    .map((p) => p.image_url)
    .filter(Boolean) as string[],
)
const instagramAvatar = computed(() => igData.value?.profile_image_url ?? null)

// Products get a photo from the creator's feed unless they already have one (or cleared it).
function ensureProductImages() {
  if (store.value) assignProductImages(store.value.products, feed.value, store.value.cover_url)
}
onMounted(ensureProductImages)

// Clicking a card selects it: on desktop the right panel becomes "Edit product".
const selectedProductId = ref<string | null>(null)
const selectedIndex = computed(() => store.value?.products.findIndex((p) => p.id === selectedProductId.value) ?? -1)
const selectedProduct = computed(() => (selectedIndex.value >= 0 ? store.value.products[selectedIndex.value]! : null))
function selectProduct(index: number) {
  const p = store.value.products[index]
  if (!p || selectedProductId.value === p.id) return
  selectedProductId.value = p.id
  rightTab.value = 'content'
}

// Product photo: opens "Edit product" in the right panel (slid in on phones).
async function openProductImage(index: number) {
  const p = store.value.products[index]
  if (!p) return
  selectedProductId.value = p.id
  rightTab.value = 'content'
  if (!isDesktop()) openRightPanel()
  await nextTick()
  scrollPanelTo('.ws-right', '#product-image')
}

function toggle(index: number) {
  const p = store.value.products[index]
  if (!p) return
  if (!p.added && addedCount.value >= MAX_IN_STORE) {
    return show(`Your store can have up to ${MAX_IN_STORE} products. Undo one first.`, 'error')
  }
  p.added = !p.added
  if (p.added) show(`Added "${p.title}" to your store`)
}

const publicUrl = computed(() =>
  draft.value.publishedId && import.meta.client ? `${location.origin}/s/${draft.value.publishedId}` : '',
)
const dirty = computed(() => !draft.value.publishedId || JSON.stringify(store.value) !== draft.value.publishedSnapshot)

async function rewrite(target: 'bio' | 'product' | 'new_product', index?: number, instruction?: string) {
  const s = store.value
  busy.value = target === 'bio' ? 'bio' : target === 'new_product' ? 'new' : s.products[index!]!.id
  try {
    const res = await $fetch<RegenerateResponse>('/api/store/regenerate', {
      method: 'POST',
      body: { document: draft.value.document, store: s, target, index, instruction },
    })
    if (!res.ok) return show(res.message, 'error')
    if (target === 'bio') {
      s.headline = res.result.headline
      s.bio = res.result.bio
    } else if (target === 'product') {
      const old = s.products[index!]
      const wasAdded = old?.added
      s.products.splice(index!, 1, { ...res.result, added: false, image_url: old?.image_url })
      if (wasAdded) show('New idea ready. Add it to your store if you like it.')
    } else {
      s.products.push({ ...res.result, added: false })
      ensureProductImages()
    }
  } catch (e) {
    show(errorMessage(e), 'error')
  } finally {
    busy.value = null
  }
}

function remove(index: number) {
  const [removed] = store.value.products.splice(index, 1)
  if (removed?.id === selectedProductId.value) selectedProductId.value = null
  show(`Removed "${removed?.title}"`)
}

/** Rewrites the whole page, keeping its current language and creator type unless a language is given. */
async function regenerateAll(language?: Language) {
  if (!confirm('This replaces your headline, bio and all products. Continue?')) return
  busy.value = 'all'
  try {
    const res = await $fetch<GenerateResponse>('/api/store/generate', {
      method: 'POST',
      body: {
        document: draft.value.document,
        language: language ?? store.value.language,
        playbook: store.value.playbook?.id,
        name: store.value.name,
      },
    })
    if (!res.ok) return show(res.message, 'error')
    const s = res.store
    Object.assign(store.value, {
      language: s.language,
      headline: s.headline,
      bio: s.bio,
      products: s.products.map((p) => ({ ...p, added: false })),
      playbook: s.playbook,
      pledge: s.pledge,
      disclaimer: s.disclaimer,
      insights: s.insights,
      tips: s.tips,
    })
    selectedProductId.value = null
    ensureProductImages()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (e) {
    show(errorMessage(e), 'error')
  } finally {
    busy.value = null
  }
}

async function publish() {
  if (!addedCount.value) {
    view.value = 'edit'
    return show('Add at least one product to your store first. Tap "Add to my store" on an idea.', 'error')
  }
  const pledge = store.value.pledge
  if (pledge?.enabled && !pledge.confirmed) {
    view.value = 'edit'
    show('Tick "I confirm this is true" on your impact pledge, or turn the pledge off.', 'error')
    await nextTick()
    document.querySelector('.pledge')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  publishing.value = true
  try {
    const res = await $fetch<{ id: string; editToken: string }>('/api/store/publish', {
      method: 'POST',
      body: {
        store: { ...store.value, products: store.value.products.filter((p) => p.added) },
        id: draft.value.publishedId,
        editToken: draft.value.editToken,
      },
    })
    draft.value.publishedId = res.id
    draft.value.editToken = res.editToken
    draft.value.publishedSnapshot = JSON.stringify(store.value)
    shareOpen.value = true
  } catch (e) {
    show(errorMessage(e), 'error')
  } finally {
    publishing.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(publicUrl.value)
    show('Link copied')
  } catch {
    show('Could not copy. Long-press the link to copy it.', 'error')
  }
}

const whatsappUrl = computed(
  () => `https://wa.me/?text=${encodeURIComponent(`Check out my page: ${publicUrl.value}`)}`,
)

async function startOver() {
  if (!confirm('Start over? Your current draft will be cleared. Published pages stay live.')) return
  reset()
  await navigateTo('/')
}
</script>

<template>
  <div v-if="draft.store" class="editor">
    <nav class="topbar">
      <!-- phone: ☰ (Build your page) · Edit/Preview · sliders (Edit page) · Publish -->
      <button
        type="button"
        class="hamburger mobile-only"
        aria-label="Open menu"
        aria-controls="ws-left"
        :aria-expanded="drawerOpen"
        @click="openLeftPanel"
      >
        <span aria-hidden="true">☰</span>
        <span v-if="suggestedLanguage" class="dot" aria-hidden="true" />
      </button>
      <!-- desktop: brand · start over -->
      <div class="brand desktop-only-flex">
        <span class="brand-mark" aria-hidden="true"><UiIcon name="sparkles" :size="16" /></span>
        <strong>SuperProfile Storefront</strong>
        <button type="button" class="back-link" @click="startOver"><UiIcon name="arrow-left" :size="16" /> Start over</button>
      </div>

      <div class="seg mobile-only" role="tablist" aria-label="View">
        <button role="tab" :aria-selected="view === 'edit'" :class="{ active: view === 'edit' }" @click="view = 'edit'">Edit</button>
        <button role="tab" :aria-selected="view === 'preview'" :class="{ active: view === 'preview' }" @click="view = 'preview'">Preview</button>
      </div>

      <div class="topbar-actions">
        <span class="saved desktop-only-flex" aria-live="polite"><UiIcon name="check" :size="15" /> Draft saved {{ savedLabel }}</span>
        <button type="button" class="ghost-btn desktop-only-flex" @click="view = view === 'edit' ? 'preview' : 'edit'">
          <template v-if="view === 'edit'"><UiIcon name="eye" /> Preview</template>
          <template v-else><UiIcon name="pencil" /> Edit</template>
        </button>
        <button
          type="button"
          class="hamburger mobile-only"
          aria-label="Edit and customise page"
          aria-controls="ws-right"
          :aria-expanded="rightOpen"
          @click="openRightPanel"
        >
          <UiIcon name="sliders" :size="18" />
        </button>
        <button type="button" class="publish" :disabled="publishing || !!busy" @click="publish">
          <UiIcon name="rocket" class="desktop-only-inline" />
          {{ publishing ? 'Publishing…' : draft.publishedId ? (dirty ? 'Update' : 'Published ✓') : 'Publish' }}
        </button>
      </div>
    </nav>

    <!--
      Desktop: "Build your page" nav | the page as a card | "Edit page" panel (Content / Design / Sections).
      Phone: just the page; the same two panels slide in from the left (☰) and right (sliders button).
    -->
    <div v-if="drawerOpen || rightOpen" class="ws-backdrop mobile-only" @click="closePanels" />

    <div class="workspace" :class="`is-${view}`" :style="{ '--left-w': `${leftWidth}px` }">
      <aside v-if="view === 'edit'" id="ws-left" class="ws-left" :class="{ wide: leftWide, open: drawerOpen }" aria-label="Build your page">
        <button type="button" class="ws-close mobile-only" aria-label="Close menu" @click="closePanels">✕</button>
        <button
          type="button"
          class="ws-expand"
          :aria-label="leftWide ? 'Make panel narrower' : 'Make panel wider'"
          :title="leftWide ? 'Collapse panel' : 'Expand panel'"
          aria-controls="ws-left"
          :aria-expanded="leftWide"
          @click="toggleLeftWidth"
        >
          <UiIcon :name="leftWide ? 'panel-collapse' : 'panel-expand'" :size="18" />
        </button>
        <template v-if="!leftPanel">
          <h2 class="ws-title">Build your page</h2>
          <p class="ws-sub">Personalise your page, tell your story, and start selling.</p>
          <nav class="nav-cards">
            <button type="button" class="nav-card" @click="leftPanel = 'suggestions'">
              <span class="nav-icon"><UiIcon name="sparkles" /></span>
              <span class="nav-text"><strong>AI Suggestions</strong><small>Content and selling ideas for you</small></span>
              <span v-if="suggestionCount" class="badge-count">{{ suggestionCount }}</span>
              <UiIcon name="chevron-right" class="nav-chev" />
            </button>
            <button type="button" class="nav-card" @click="goDesignTab">
              <span class="nav-icon"><UiIcon name="pencil" /></span>
              <span class="nav-text"><strong>Design</strong><small>Colours, cover and profile picture</small></span>
              <UiIcon name="chevron-right" class="nav-chev" />
            </button>
            <button type="button" class="nav-card" @click="leftPanel = 'insights'">
              <span class="nav-icon"><UiIcon name="chart" /></span>
              <span class="nav-text"><strong>Insights from AI</strong><small>What the AI learned about you</small></span>
              <UiIcon name="chevron-right" class="nav-chev" />
            </button>
          </nav>
          <button type="button" class="link danger-link mobile-only ws-startover" @click="startOver">← Start over</button>
        </template>

        <template v-else>
          <button type="button" class="back-link" @click="leftPanel = null"><UiIcon name="arrow-left" :size="16" /> Back</button>
          <template v-if="leftPanel === 'suggestions'">
            <h2 class="ws-title">AI Suggestions</h2>
            <SuggestionsList :store="store" :suggested-language="suggestedLanguage" :busy="!!busy" @switch-language="switchLanguage" />
          </template>
          <template v-else-if="leftPanel === 'insights' && draft.document">
            <h2 class="ws-title">Insights from AI</h2>
            <ResultView :document="draft.document" />
          </template>
        </template>
      </aside>

      <div
        v-if="view === 'edit'"
        class="ws-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the left panel"
        aria-controls="ws-left"
        :aria-valuenow="leftWidth"
        :aria-valuemin="LEFT_MIN"
        :aria-valuemax="LEFT_MAX"
        tabindex="0"
        title="Drag to resize · double-click to expand"
        @pointerdown.prevent="startResize"
        @dblclick="toggleLeftWidth"
        @keydown="resizeKey"
      />

      <main class="editor-main">
        <p v-if="view === 'edit'" class="edit-hint mobile-only">Tap any text to change it. Add the product ideas you like to your store.</p>
        <p v-if="draft.publishedId" class="live-link">
          Live at <a :href="publicUrl" target="_blank" rel="noopener">{{ publicUrl.replace(/^https?:\/\//, '') }}</a>
          <span v-if="dirty" class="muted"> · unpublished changes</span>
        </p>

        <!-- Preview shows the page exactly as visitors will see it on this device (phone or wide layout). -->
        <div class="store-frame">
          <StorePage
            :store="store"
            :editable="view === 'edit'"
            :busy="busy"
            cart
            :max-ideas="MAX_IDEAS"
            @rewrite="rewrite"
            @remove="remove"
            @toggle="toggle"
            @design="openDesign"
            @select="selectProduct"
            @product-image="openProductImage"
            :selected-id="selectedProductId"
            @cta="show('Buttons work on your published page.')"
          />
        </div>
        <button v-if="view === 'edit'" type="button" class="regen-all" :disabled="!!busy" @click="regenerateAll()">
          {{ busy === 'all' ? 'Rewriting your page…' : '↻ Regenerate whole page' }}
        </button>
      </main>

      <aside v-if="view === 'edit'" id="ws-right" class="ws-right" :class="{ open: rightOpen }" aria-label="Edit page">
        <button type="button" class="ws-close mobile-only" aria-label="Close panel" @click="closePanels">✕</button>
        <h2 class="ws-title">{{ selectedProduct && rightTab === 'content' ? 'Edit product' : 'Edit page' }}</h2>
        <div class="tabs-line" role="tablist">
          <button v-for="t in RIGHT_TABS" :key="t.id" role="tab" :aria-selected="rightTab === t.id" :class="{ active: rightTab === t.id }" @click="rightTab = t.id">
            {{ t.label }}
          </button>
        </div>

        <div v-if="rightTab === 'content' && selectedProduct" class="rows">
          <button type="button" class="back-link" @click="selectedProductId = null"><UiIcon name="arrow-left" :size="16" /> Page content</button>
          <div id="product-image" class="row-card col">
            <span class="row-head"><span class="row-icon"><UiIcon name="image" /></span><strong>Product photo</strong></span>
            <ImagePicker v-model="selectedProduct.image_url" :choices="feed" kind="product" none-label="No photo" label="Product photo" />
          </div>
          <button type="button" class="row-card" @click="focusField(`p-title-${selectedProduct.id}`)">
            <span class="row-icon"><UiIcon name="type" /></span>
            <span class="row-text"><strong>Title</strong><small>{{ selectedProduct.title }}</small></span>
            <UiIcon name="chevron-right" class="nav-chev" />
          </button>
          <button type="button" class="row-card" @click="focusField(`p-desc-${selectedProduct.id}`)">
            <span class="row-icon"><UiIcon name="list" /></span>
            <span class="row-text"><strong>Description</strong><small>{{ selectedProduct.description }}</small></span>
            <UiIcon name="chevron-right" class="nav-chev" />
          </button>
          <label class="row-card">
            <span class="row-icon"><UiIcon name="bag" /></span>
            <span class="row-text"><strong>Category</strong>
              <select v-model="selectedProduct.format" class="row-select">
                <option v-for="(label, key) in formatOptionsFor(store, selectedProduct.format)" :key="key" :value="key">{{ label }}</option>
              </select>
            </span>
          </label>
          <label class="row-card">
            <span class="row-icon">₹</span>
            <span class="row-text"><strong>Price</strong>
              <span class="row-price">₹ <input v-model.number="selectedProduct.price_inr" type="number" min="0" max="100000" inputmode="numeric" aria-label="Price in rupees" />{{ ['community', 'sponsorship'].includes(selectedProduct.format) ? ' /month' : '' }}</span>
            </span>
          </label>
          <div v-if="selectedProduct.price_rationale" class="row-card col why-row">
            <span class="row-head"><span class="row-icon"><UiIcon name="info" /></span><strong>Why this price</strong></span>
            <p>{{ selectedProduct.price_rationale }}</p>
          </div>
          <label class="row-card switch-row">
            <span class="row-icon"><UiIcon name="bag" /></span>
            <span class="row-text"><strong>In my store</strong><small>Show this on the published page</small></span>
            <input type="checkbox" class="switch" :checked="!!selectedProduct.added" @change="toggle(selectedIndex)" />
          </label>
          <div class="row-actions">
            <button type="button" class="pill-btn" :disabled="!!busy" @click="rewrite('product', selectedIndex)">
              <UiIcon name="sparkles" :size="16" /> {{ busy === selectedProduct.id ? 'Rewriting…' : 'New idea' }}
            </button>
            <button type="button" class="link danger-link" :disabled="!!busy || store.products.length <= 1" @click="remove(selectedIndex)">Dismiss idea</button>
          </div>
        </div>

        <div v-else-if="rightTab === 'content'" class="rows">
          <button type="button" class="row-card" @click="openDesign('cover')">
            <span class="row-icon"><UiIcon name="image" /></span>
            <span class="row-text"><strong>Cover image</strong><small>{{ store.cover_url ? 'From your feed or upload' : 'None yet' }}</small></span>
            <img v-if="store.cover_url" :src="store.cover_url" alt="" class="row-thumb" referrerpolicy="no-referrer" />
            <UiIcon name="chevron-right" class="nav-chev" />
          </button>
          <button type="button" class="row-card" @click="focusField('name')">
            <span class="row-icon"><UiIcon name="user" /></span>
            <span class="row-text"><strong>Profile</strong><small>{{ [store.name, store.handle].filter(Boolean).join(', ') }}</small></span>
            <UiIcon name="chevron-right" class="nav-chev" />
          </button>
          <button type="button" class="row-card" @click="focusField('headline')">
            <span class="row-icon"><UiIcon name="type" /></span>
            <span class="row-text"><strong>Title</strong><small>{{ store.headline || 'Add a headline' }}</small></span>
            <UiIcon name="chevron-right" class="nav-chev" />
          </button>
          <button type="button" class="row-card" @click="focusField('bio')">
            <span class="row-icon"><UiIcon name="list" /></span>
            <span class="row-text"><strong>About</strong><small>{{ store.bio || 'Add a short bio' }}</small></span>
            <UiIcon name="chevron-right" class="nav-chev" />
          </button>
          <button v-if="store.pledge" type="button" class="row-card" @click="focusField('pledge')">
            <span class="row-icon"><UiIcon name="heart" /></span>
            <span class="row-text"><strong>Impact pledge</strong><small>{{ store.pledge.enabled ? `${store.pledge.percent}% to ${store.pledge.recipient || 'your cause'}` : 'Off' }}</small></span>
            <UiIcon name="chevron-right" class="nav-chev" />
          </button>
          <button type="button" class="row-card" @click="focusField('products')">
            <span class="row-icon"><UiIcon name="bag" /></span>
            <span class="row-text">
              <strong>{{ store.playbook?.id === 'cause' ? 'Store / Contribution' : 'Store' }}</strong>
              <small v-if="leadProduct">{{ leadProduct.title }} · {{ formatPrice(leadProduct) }}</small>
              <small v-else>No products yet</small>
            </span>
            <UiIcon name="chevron-right" class="nav-chev" />
          </button>
        </div>

        <DesignPanel v-else-if="rightTab === 'design'" flat :store="store" :feed="feed" :instagram-avatar="instagramAvatar" />

        <div v-else class="rows">
          <p class="muted small">Choose what appears on your page.</p>
          <label v-for="(p, i) in store.products" :key="p.id" class="row-card switch-row">
            <span class="row-text"><strong>{{ p.title }}</strong><small>{{ formatPrice(p) }} · {{ FORMAT_LABELS[p.format] || p.format }}</small></span>
            <input type="checkbox" class="switch" :checked="!!p.added" @change="toggle(i)" />
          </label>
          <button v-if="store.products.length < MAX_IDEAS" type="button" class="row-card add-row" :disabled="!!busy" @click="rewrite('new_product')">
            <span class="row-icon"><UiIcon name="plus" /></span>
            <span class="row-text"><strong>{{ busy === 'new' ? 'Thinking of another idea…' : 'Suggest another product' }}</strong></span>
          </button>
          <label v-if="store.pledge" class="row-card switch-row">
            <span class="row-text"><strong>Impact pledge</strong><small>Show where the money goes</small></span>
            <input v-model="store.pledge.enabled" type="checkbox" class="switch" />
          </label>
          <p class="muted small">{{ addedCount }} of up to {{ MAX_IN_STORE }} products in your store.</p>
        </div>
      </aside>
    </div>

    <div v-if="shareOpen" class="sheet-backdrop" @click.self="shareOpen = false">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <h2 id="share-title">Your page is live 🎉</h2>
        <p class="muted">Share it in your Instagram bio, WhatsApp groups or stories.</p>
        <input class="share-url" :value="publicUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
        <div class="share-actions">
          <button type="button" class="primary" @click="copyLink">Copy link</button>
          <a class="secondary" :href="whatsappUrl" target="_blank" rel="noopener">Share on WhatsApp</a>
          <a class="secondary" :href="publicUrl" target="_blank" rel="noopener">Open my page</a>
        </div>
        <button type="button" class="link" @click="shareOpen = false">Keep editing</button>
      </div>
    </div>
  </div>
</template>
