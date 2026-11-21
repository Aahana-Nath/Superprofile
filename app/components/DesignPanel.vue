<script setup lang="ts">
import { SUGGESTED_THEME, THEMES, type Store } from '~/types/pipeline'

// Look-and-feel controls: theme colour, cover banner and profile photo.
// Feed images come from the creator's own Instagram posts; uploads are resized in the browser.
// flat: render without the collapsible wrapper (used inside the desktop "Design" tab).
const props = defineProps<{ store: Store; feed: string[]; instagramAvatar: string | null; flat?: boolean }>()

const suggested = computed(() => SUGGESTED_THEME[props.store.playbook?.id || 'general'] || 'indigo')
const currentTheme = computed(() => props.store.theme?.color || suggested.value)

function setTheme(id: string) {
  props.store.theme = { color: id }
}

const avatarChoices = computed(() => [...new Set([props.instagramAvatar, ...props.feed].filter(Boolean) as string[])])
</script>

<template>
  <component :is="flat ? 'div' : 'details'" class="design" :class="{ 'card panel': !flat, flat }">
    <summary v-if="!flat">🎨 Design your page</summary>

    <section id="design-theme" class="design-block">
      <h4>Theme colour</h4>
      <div class="swatches" role="radiogroup" aria-label="Theme colour">
        <button
          v-for="t in THEMES"
          :key="t.id"
          type="button"
          role="radio"
          class="swatch"
          :class="{ on: currentTheme === t.id }"
          :aria-checked="currentTheme === t.id"
          :aria-label="`${t.label}${t.id === suggested ? ' (suggested)' : ''}`"
          :style="{ background: `linear-gradient(135deg, ${t.soft} 0 45%, ${t.accent} 45% 100%)` }"
          @click="setTheme(t.id)"
        >
          <span v-if="t.id === suggested" class="sugg">★</span>
        </button>
      </div>
      <p class="muted small">★ Suggested for {{ store.playbook?.label?.toLowerCase() || 'creators like you' }}</p>
    </section>

    <section id="design-cover" class="design-block">
      <h4>Cover banner</h4>
      <ImagePicker v-model="store.cover_url" :choices="feed" kind="cover" none-label="No banner" label="Cover banner" />
      <p v-if="feed.length" class="muted small">From your recent posts, most-liked first. We picked the top one.</p>
    </section>

    <section id="design-avatar" class="design-block">
      <h4>Profile picture</h4>
      <ImagePicker v-model="store.avatar_url" :choices="avatarChoices" kind="avatar" none-label="Initials" label="Profile picture" round />
    </section>
  </component>
</template>
