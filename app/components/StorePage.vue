<script setup lang="ts">
import { FORMAT_LABELS, MONTHLY_FORMATS, formatOptionsFor, formatPrice, pledgeText, themeById, type Product, type Store } from '~/types/pipeline'

// cart: the editor's "pick what goes in your store" mode. Edit shows every idea with an Add button;
// preview shows only added products. Published pages don't pass it and show everything they have.
const props = defineProps<{
  store: Store
  editable?: boolean
  busy?: string | null
  cart?: boolean
  maxIdeas?: number
  selectedId?: string | null
}>()
const emit = defineEmits<{
  rewrite: [target: 'bio' | 'product' | 'new_product', index?: number, instruction?: string]
  remove: [index: number]
  toggle: [index: number]
  cta: [product: Product]
  design: [section: 'cover' | 'avatar']
  select: [index: number]
  productImage: [index: number]
}>()

// Product photos that failed to load (e.g. an expired Instagram link) are hidden rather than shown broken.
const failedImages = reactive(new Set<string>())
const hasPhoto = (p: Product) => !!p.image_url && !failedImages.has(p.id)
watch(
  () => props.store.products.map((p) => p.image_url),
  () => failedImages.clear(),
)

const shown = computed(() =>
  props.store.products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => props.editable || !props.cart || p.added === true),
)

const openWhy = ref(new Set<string>())
function toggleWhy(id: string) {
  const next = new Set(openWhy.value)
  next.has(id) ? next.delete(id) : next.add(id)
  openWhy.value = next
}

// The AI's reasoning names the price it suggested; flag it if the creator has since edited the price.
const rationaleMatches = (p: Product) => {
  const text = (p.price_rationale || '').replace(/[,\s]/g, '')
  return text.includes(`₹${p.price_inr}`)
}


const avatarFailed = ref(false)
const coverFailed = ref(false)
// A newly chosen image gets a fresh chance to load.
watch(() => props.store.avatar_url, () => (avatarFailed.value = false))
watch(() => props.store.cover_url, () => (coverFailed.value = false))

const themeVars = computed(() => {
  const t = themeById(props.store.theme?.color)
  return { '--t-accent': t.accent, '--t-ink': t.ink, '--t-soft': t.soft, '--t-soft2': t.soft2 }
})
const initials = computed(() =>
  (props.store.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''),
)
const locked = computed(() => !!props.busy)
const instagramUrl = computed(() => props.store.handle && `https://instagram.com/${props.store.handle.replace(/^@/, '')}`)
</script>

<template>
  <article class="store" :class="{ editing: editable, 'has-cover': !!store.cover_url && !coverFailed }" :style="themeVars">
    <div v-if="store.cover_url && !coverFailed" class="cover" data-field="cover">
      <img :src="store.cover_url" alt="" referrerpolicy="no-referrer" @error="coverFailed = true" />
      <button v-if="editable" type="button" class="cover-btn" @click="emit('design', 'cover')">
        <UiIcon name="image" :size="16" /> Change cover
      </button>
    </div>
    <button v-else-if="editable" type="button" class="cover-add" data-field="cover" @click="emit('design', 'cover')">
      <UiIcon name="image" :size="16" /> Add a cover banner
    </button>
    <header class="store-head">
      <div class="avatar-wrap">
        <img
          v-if="store.avatar_url && !avatarFailed"
          :src="store.avatar_url"
          alt=""
          class="store-avatar"
          referrerpolicy="no-referrer"
          @error="avatarFailed = true"
        />
        <div v-else class="store-avatar initials" aria-hidden="true">{{ initials }}</div>
        <button v-if="editable" type="button" class="avatar-btn" aria-label="Change profile picture" @click="emit('design', 'avatar')">
          <UiIcon name="camera" :size="16" />
        </button>
      </div>

      <EditableText v-model="store.name" :editable="editable" tag="h1" class="store-name" data-field="name" label="Your name" placeholder="Your name" :maxlength="60" />
      <a v-if="store.handle && !editable" :href="instagramUrl || undefined" target="_blank" rel="noopener" class="store-handle">{{ store.handle }}</a>
      <p v-else-if="store.handle" class="store-handle">{{ store.handle }}</p>

      <div class="section" :class="{ loading: busy === 'bio' || busy === 'all' }">
        <div class="headline-pill" data-field="headline">
          <UiIcon name="heart" :size="16" class="pill-icon" />
          <EditableText v-model="store.headline" :editable="editable" tag="p" class="store-headline" label="Headline" placeholder="One line about what you do" :maxlength="140" />
        </div>
        <EditableText v-model="store.bio" :editable="editable" tag="p" class="store-bio" data-field="bio" label="Bio" placeholder="A few lines about you" :maxlength="700" />
        <SectionTools
          v-if="editable"
          glyph="✎"
          label="Rewrite with AI"
          examples="e.g. more personal, mention students"
          :busy="busy === 'bio'"
          :disabled="locked"
          @rewrite="(note) => emit('rewrite', 'bio', undefined, note)"
        />
      </div>

      <div v-if="store.pledge && (editable || store.pledge.enabled)" class="pledge" data-field="pledge" :class="{ off: !store.pledge.enabled }">
        <template v-if="editable">
          <label class="pledge-toggle">
            <input v-model="store.pledge.enabled" type="checkbox" />
            <span>Show an impact pledge on my page</span>
          </label>
          <template v-if="store.pledge.enabled">
            <div class="pledge-fields">
              <label>
                Share of each payment
                <span class="pct"><input v-model.number="store.pledge.percent" type="number" min="1" max="100" inputmode="numeric" />%</span>
              </label>
              <label>
                Goes to
                <input v-model="store.pledge.recipient" maxlength="80" placeholder="Your trust or NGO name" />
              </label>
              <label>
                Pays for
                <input v-model="store.pledge.purpose" maxlength="140" placeholder="e.g. food and vet care for rescued animals" />
              </label>
            </div>
            <p class="pledge-preview">💛 {{ pledgeText(store.pledge, store.language) }}</p>
            <label class="pledge-confirm">
              <input v-model="store.pledge.confirmed" type="checkbox" />
              <span>I confirm this is true. Supporters will rely on it.</span>
            </label>
          </template>
        </template>
        <p v-else class="pledge-preview">💛 {{ pledgeText(store.pledge, store.language) }}</p>
      </div>
    </header>

    <section class="products" aria-label="Products" data-field="products">
      <div v-for="{ p, i } in shown" :key="p.id" class="product-wrap">
        <article
          class="pcard section"
          :class="{
            loading: busy === p.id || busy === 'all',
            added: cart && editable && p.added,
            idea: cart && editable && !p.added,
            selected: editable && selectedId === p.id,
            'has-photo': hasPhoto(p),
          }"
          @click="editable && emit('select', i)"
          @focusin="editable && emit('select', i)"
        >
          <div v-if="cart && editable" class="pcard-head">
            <button type="button" class="pcard-add" :class="{ on: p.added }" :aria-pressed="!!p.added" :disabled="busy === p.id" @click.stop="emit('toggle', i)">
              <template v-if="p.added"><UiIcon name="check" :size="16" /> In my store · <u>Undo</u></template>
              <template v-else><UiIcon name="plus" :size="16" /> Add to my store</template>
            </button>
          </div>

          <div class="pcard-body">
            <!-- polaroid-style product photo (from the creator's feed or an upload) -->
            <div v-if="hasPhoto(p) || editable" class="polaroid" :class="{ empty: !hasPhoto(p) }">
              <span class="tape" aria-hidden="true" />
              <img v-if="hasPhoto(p)" :src="p.image_url!" alt="" referrerpolicy="no-referrer" @error="failedImages.add(p.id)" />
              <button v-if="editable" type="button" class="polaroid-btn" :aria-label="hasPhoto(p) ? 'Change product photo' : 'Add a product photo'" @click.stop="emit('productImage', i)">
                <UiIcon name="camera" :size="15" />
                <span v-if="!hasPhoto(p)">Add photo</span>
              </button>
            </div>

            <div class="pcard-main">
              <div class="pcard-top">
                <EditableText v-model="p.title" :editable="editable" tag="h2" class="pcard-title" :data-field="`p-title-${p.id}`" label="Product title" :maxlength="100" />
                <label v-if="editable" class="price-pill price-edit">
                  <span>₹</span>
                  <input v-model.number="p.price_inr" type="number" inputmode="numeric" min="0" max="100000" aria-label="Price in rupees" />
                  <span v-if="MONTHLY_FORMATS.has(p.format)" class="per">/mo</span>
                </label>
                <span v-else class="price-pill">{{ formatPrice(p) }}</span>
              </div>

              <div class="pcard-meta">
                <span v-if="editable" class="fmt-pill">
                  <UiIcon name="bag" :size="14" />
                  <select v-model="p.format" aria-label="Product format" @click.stop>
                    <option v-for="(label, key) in formatOptionsFor(store, p.format)" :key="key" :value="key">{{ label }}</option>
                  </select>
                </span>
                <span v-else class="fmt-pill"><UiIcon name="bag" :size="14" /> {{ FORMAT_LABELS[p.format] || p.format }}</span>

                <button
                  v-if="editable && p.price_rationale"
                  type="button"
                  class="why-toggle"
                  :aria-expanded="openWhy.has(p.id)"
                  @click.stop="toggleWhy(p.id)"
                >
                  Why {{ formatPrice(p) }}? <UiIcon name="info" :size="14" />
                </button>
              </div>
              <p v-if="editable && p.price_rationale && openWhy.has(p.id)" class="why-text">
                <template v-if="!rationaleMatches(p)">You changed the price. Our original reasoning: </template>{{ p.price_rationale }}
              </p>

              <EditableText v-model="p.description" :editable="editable" tag="p" class="pcard-desc" :data-field="`p-desc-${p.id}`" label="Product description" :maxlength="800" />
            </div>
          </div>

          <footer class="pcard-foot">
            <SectionTools
              v-if="editable"
              glyph="✦"
              label="New idea"
              examples="e.g. make it a template pack, cheaper"
              :busy="busy === p.id"
              :disabled="locked"
              @rewrite="(note) => emit('rewrite', 'product', i, note)"
            >
              <button type="button" role="menuitem" class="danger" :disabled="locked || store.products.length <= 1" @click="emit('remove', i)">
                ✕ {{ cart ? 'Dismiss this idea' : 'Remove' }}
              </button>
            </SectionTools>

            <div v-if="editable" class="pcard-cta editing">
              <UiIcon name="bag" />
              <input v-model="p.cta" maxlength="40" aria-label="Button label" @click.stop />
              <UiIcon name="arrow-right" />
            </div>
            <button v-else type="button" class="pcard-cta" @click="emit('cta', p)">
              <UiIcon name="bag" /> <span>{{ p.cta }}</span> <UiIcon name="arrow-right" />
            </button>
          </footer>
        </article>
      </div>

      <div v-if="cart && !editable && !shown.length" class="empty-store">
        <p><strong>No products in your store yet.</strong></p>
        <p class="muted">Switch to Edit and tap "Add to my store" on the ideas you like.</p>
      </div>

      <button
        v-if="editable && store.products.length < (maxIdeas || 4)"
        type="button"
        class="add-product"
        :disabled="locked"
        @click="emit('rewrite', 'new_product')"
      >
        {{ busy === 'new' ? 'Thinking of another idea…' : '+ Suggest another product' }}
      </button>
    </section>

    <footer v-if="editable || store.disclaimer" class="disclaimer">
      <EditableText v-model="store.disclaimer" :editable="editable" tag="p" label="Disclaimer" placeholder="Optional disclaimer (leave empty to hide)" :maxlength="300" />
    </footer>
  </article>
</template>
