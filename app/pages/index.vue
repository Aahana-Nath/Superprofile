<script setup lang="ts">
import type { CreatorDocument, GenerateResponse, Language, RunResponse } from '~/types/pipeline'
import { LANGUAGE_OPTIONS, SUGGESTED_THEME, pickCover } from '~/types/pipeline'

const FOLLOWER_OPTIONS = [
  { value: 'none', label: "I don't have an audience yet" },
  { value: 'under_5k', label: 'Under 5K' },
  { value: '5k_25k', label: '5K to 25K' },
  { value: '25k_100k', label: '25K to 100K' },
  { value: '100k_plus', label: '100K+' },
]

const { draft, reset } = useDraft()
const mode = ref<'instagram' | 'manual'>('instagram')
const handle = ref('')
const igLanguage = ref<Language>('english')
const manual = reactive({
  name: '',
  description: '',
  audience: '',
  follower_range: '',
  language: 'english',
  credibility: '',
  existing_prices: '',
})

type Phase = 'idle' | 'reading' | 'writing'
const phase = ref<Phase>('idle')
const notice = ref('')
const error = ref('')
const vague = ref<{ note: string; doc: CreatorDocument; canContinue: boolean } | null>(null)

const steps = computed(() =>
  mode.value === 'instagram'
    ? ['Reading your Instagram', 'Understanding what you create', 'Designing products and prices', 'Writing your page']
    : ['Understanding what you create', 'Designing products and prices', 'Writing your page'],
)
const activeStep = ref(0)
let stepTimer: ReturnType<typeof setInterval> | undefined

function startSteps(from: number, to: number, everyMs: number) {
  clearInterval(stepTimer)
  activeStep.value = from
  stepTimer = setInterval(() => activeStep.value < to && activeStep.value++, everyMs)
}
onBeforeUnmount(() => clearInterval(stepTimer))

async function submit() {
  error.value = ''
  notice.value = ''
  vague.value = null
  phase.value = 'reading'
  const writeFrom = mode.value === 'instagram' ? 2 : 1
  startSteps(0, writeFrom - 1, mode.value === 'instagram' ? 15000 : 4000)
  try {
    const res = await $fetch<RunResponse>('/api/run', {
      method: 'POST',
      body: mode.value === 'instagram' ? { mode: 'instagram', handle: handle.value } : { mode: 'manual', manual },
    })
    if (!res.ok) {
      if (res.fallback_to_manual) {
        mode.value = 'manual'
        notice.value = `${res.message} No problem, tell us a bit about yourself instead.`
      } else {
        error.value = res.message
      }
      return
    }
    const qc = res.document.quality_control
    if (res.document.input_method === 'manual' && qc.input_quality !== 'ok') {
      vague.value = {
        note: qc.input_quality_note || 'the description is too vague',
        doc: res.document,
        canContinue: qc.input_quality === 'too_vague',
      }
      return
    }
    await writeStore(res.document)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    phase.value = 'idle'
    clearInterval(stepTimer)
  }
}

async function writeStore(doc: CreatorDocument) {
  phase.value = 'writing'
  const first = mode.value === 'instagram' ? 2 : 1
  startSteps(first, steps.value.length - 1, 5000)
  const ig = doc.instagram_data
  const name = ig ? ig.display_name || ig.username.replace(/^@/, '') : manual.name.trim()
  try {
    const language = doc.instagram_data ? igLanguage.value : manual.language
    const res = await $fetch<GenerateResponse>('/api/store/generate', {
      method: 'POST',
      body: { document: doc, name, language },
    })
    if (!res.ok) {
      error.value = res.message
      return
    }
    reset()
    draft.value = {
      document: doc,
      store: {
        name,
        handle: ig?.username ?? null,
        // Auto-filled from their feed; changeable in "Design your page".
        avatar_url: ig?.profile_image_url ?? null,
        cover_url: pickCover(ig?.posts),
        theme: { color: SUGGESTED_THEME[res.store.playbook?.id ?? 'general'] ?? 'indigo' },
        ...res.store,
      },
      publishedId: null,
      editToken: null,
    }
    await navigateTo('/edit')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    phase.value = 'idle'
    clearInterval(stepTimer)
  }
}

async function continueAnyway() {
  if (!vague.value) return
  const { doc } = vague.value
  vague.value = null
  error.value = ''
  await writeStore(doc)
}

const busy = computed(() => phase.value !== 'idle')
</script>

<template>
  <main class="container home">
    <header class="hero">
      <p class="eyebrow">SuperProfile Storefront</p>
      <h1>Your store, ready to share in a few minutes</h1>
      <p>Tell us who you are. We'll suggest what to sell, how to price it in ₹, and write your page. You can change anything.</p>
    </header>

    <section v-if="busy" class="card progress" aria-live="polite">
      <h2>Building your store…</h2>
      <ol>
        <li v-for="(s, i) in steps" :key="s" :class="{ done: i < activeStep, active: i === activeStep }">
          <span class="dot" aria-hidden="true">{{ i < activeStep ? '✓' : '' }}</span>{{ s }}
        </li>
      </ol>
      <p class="hint">{{ mode === 'instagram' ? 'Reading Instagram can take up to a minute.' : 'This usually takes 15 to 30 seconds.' }}</p>
    </section>

    <section v-else class="card">
      <div class="tabs" role="tablist">
        <button role="tab" :aria-selected="mode === 'instagram'" :class="{ active: mode === 'instagram' }" @click="mode = 'instagram'">
          I have Instagram
        </button>
        <button role="tab" :aria-selected="mode === 'manual'" :class="{ active: mode === 'manual' }" @click="mode = 'manual'">
          Describe myself
        </button>
      </div>

      <p v-if="notice" class="banner warn">{{ notice }}</p>

      <form @submit.prevent="submit">
        <template v-if="mode === 'instagram'">
          <label>
            Your Instagram handle
            <input v-model="handle" placeholder="@yourname" autocomplete="off" autocapitalize="off" required />
          </label>
          <p class="hint left">We only read your public bio and recent posts.</p>
          <label>
            Page language
            <select v-model="igLanguage">
              <option v-for="o in LANGUAGE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
        </template>

        <template v-else>
          <label>
            Your name
            <input v-model="manual.name" placeholder="Priya Sharma" autocomplete="name" maxlength="60" required />
          </label>
          <label>
            Write a line or two about what you do, and what you create or inspire people with
            <textarea
              v-model="manual.description"
              rows="3"
              required
              placeholder="e.g. I travel across the Himalayas on a budget and share honest stays, routes and packing tips"
            />
          </label>

          <details class="more optional-details">
            <summary>Additional details <span class="opt">(optional)</span></summary>
            <p class="hint left">Skip these and we'll work from the line above.</p>
            <label>
              Who mostly watches your content?
              <input v-model="manual.audience" placeholder="e.g. college students who love weekend trips" />
            </label>
            <div class="row">
              <label>
                Audience size
                <select v-model="manual.follower_range">
                  <option value="">Not sure / skip</option>
                  <option v-for="o in FOLLOWER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </label>
              <label>
                Page language
                <select v-model="manual.language">
                  <option v-for="o in LANGUAGE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </label>
            </div>
            <label>
              Credentials or results
              <input v-model="manual.credibility" placeholder="e.g. Featured by Lonely Planet, 6 years guiding treks" />
            </label>
            <label>
              Anything you already sell, with prices?
              <input v-model="manual.existing_prices" placeholder="e.g. Itinerary planning call at ₹999" />
            </label>
          </details>
        </template>

        <button class="primary" type="submit">Build my store</button>
      </form>

      <div v-if="vague" class="banner warn">
        <p>We need a little more to go on: {{ vague.note }}.</p>
        <p>Add a line about what you do or create, and who it's for, then try again.</p>
        <button v-if="vague.canContinue" type="button" class="link" @click="continueAnyway">Continue anyway</button>
      </div>
      <p v-if="error" class="banner error">{{ error }}</p>
    </section>
  </main>
</template>
