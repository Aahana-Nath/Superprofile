<script setup lang="ts">
// Renders as plain text when read-only; as a borderless auto-growing textarea when editable ("tap to edit").
const props = defineProps<{ editable?: boolean; tag?: string; placeholder?: string; maxlength?: number; label: string }>()
const model = defineModel<string | null | undefined>({ default: '' })
const el = ref<HTMLTextAreaElement | null>(null)

let lastWidth = 0
function grow() {
  const t = el.value
  if (!t) return
  t.style.height = 'auto'
  // +2 covers the dashed border, which scrollHeight doesn't include
  t.style.height = `${t.scrollHeight + 2}px`
}

// Re-measure whenever the box's width changes (card layout settling, panel resize, fonts loading),
// otherwise wrapped text such as long titles gets clipped.
let observer: ResizeObserver | undefined
function observe(t: HTMLTextAreaElement | null) {
  observer?.disconnect()
  if (!t) return
  observer = new ResizeObserver(([entry]) => {
    const w = Math.round(entry!.contentRect.width)
    if (w !== lastWidth) {
      lastWidth = w
      grow()
    }
  })
  observer.observe(t)
}

onMounted(() => {
  grow()
  observe(el.value)
  document.fonts?.ready.then(grow)
})
onBeforeUnmount(() => observer?.disconnect())
// The textarea appears when switching Preview -> Edit without remounting this component.
watch(el, (t) => nextTick(() => { grow(); observe(t) }), { flush: 'post' })
watch(model, () => nextTick(grow))
</script>

<template>
  <textarea
    v-if="props.editable"
    ref="el"
    v-model="model"
    rows="1"
    class="editable"
    :aria-label="label"
    :placeholder="placeholder"
    :maxlength="maxlength"
    @input="grow"
  />
  <component :is="tag || 'p'" v-else>{{ model }}</component>
</template>
