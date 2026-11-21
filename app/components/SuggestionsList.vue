<script setup lang="ts">
import type { Language, Store } from '~/types/pipeline'

// AI suggestions for the creator: a language-switch offer, insights from their posts, and playbook tips.
defineProps<{ store: Store; suggestedLanguage: string | null; busy?: boolean }>()
const emit = defineEmits<{ switchLanguage: [lang: Language] }>()
const LANGUAGE_NAMES: Record<string, string> = { english: 'English', hinglish: 'Hinglish', hindi: 'Hindi' }
</script>

<template>
  <div class="suggestions-list">
    <span v-if="store.playbook" class="chip">{{ store.playbook.label }}</span>
    <div v-if="suggestedLanguage" class="lang-suggest">
      <span>Your posts are mostly in {{ LANGUAGE_NAMES[suggestedLanguage] }}. Want your page in {{ LANGUAGE_NAMES[suggestedLanguage] }} too?</span>
      <button type="button" class="tool solid" :disabled="busy" @click="emit('switchLanguage', suggestedLanguage as Language)">
        Switch to {{ LANGUAGE_NAMES[suggestedLanguage] }}
      </button>
    </div>
    <ul v-if="store.insights?.length">
      <li v-for="(s, i) in store.insights" :key="`i${i}`">{{ s }}</li>
    </ul>
    <details v-if="store.tips?.length" class="more-tips">
      <summary>More tips ({{ store.tips.length }})</summary>
      <ul>
        <li v-for="(s, i) in store.tips" :key="`t${i}`">{{ s }}</li>
      </ul>
    </details>
    <p class="muted small">Only you see these.</p>
  </div>
</template>
