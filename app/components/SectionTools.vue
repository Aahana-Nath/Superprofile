<script setup lang="ts">
// Per-section AI controls: one visible "Rewrite" button; less common actions (rewrite with a note,
// anything passed in the slot such as Dismiss) live behind a "⋯" menu to keep cards uncluttered.
const props = defineProps<{ busy?: boolean; disabled?: boolean; label?: string; examples?: string; glyph?: string }>()
const emit = defineEmits<{ rewrite: [instruction?: string] }>()
const menuOpen = ref(false)
const noteOpen = ref(false)
const note = ref('')
const root = ref<HTMLElement | null>(null)

function go(withNote: boolean) {
  emit('rewrite', withNote ? note.value.trim() || undefined : undefined)
  noteOpen.value = false
  menuOpen.value = false
  note.value = ''
}

function openNote() {
  menuOpen.value = false
  noteOpen.value = true
}

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) menuOpen.value = false
}
watch(menuOpen, (open) => {
  if (open) document.addEventListener('click', onDocClick)
  else document.removeEventListener('click', onDocClick)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="tools">
    <button type="button" class="tool" :disabled="disabled || busy" @click="go(false)">
      <span :class="{ spin: busy }">{{ busy ? '↻' : glyph || '↻' }}</span> {{ busy ? 'Rewriting…' : label || 'Rewrite' }}
    </button>

    <div class="menu-wrap">
      <button
        type="button"
        class="tool more"
        aria-label="More actions"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        :disabled="disabled || busy"
        @click="menuOpen = !menuOpen"
      >
        ⋯
      </button>
      <div v-if="menuOpen" class="menu" role="menu" @click="menuOpen = false">
        <button type="button" role="menuitem" @click.stop="openNote">✎ Rewrite with a note</button>
        <slot />
      </div>
    </div>

    <form v-if="noteOpen" class="note" @submit.prevent="go(true)">
      <input v-model="note" maxlength="200" :placeholder="examples || 'e.g. shorter, more Hinglish, cheaper'" autofocus />
      <button type="submit" class="tool solid" :disabled="!note.trim()">Go</button>
      <button type="button" class="tool" aria-label="Cancel" @click="noteOpen = false">✕</button>
    </form>
  </div>
</template>
