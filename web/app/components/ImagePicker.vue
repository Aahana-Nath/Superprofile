<script setup lang="ts">
import { IMAGE_SIZES, resizeImage } from '~/composables/useImageResize'

// A horizontal strip: [none] [upload] [feed images…]. Used for cover, profile and product images.
const props = defineProps<{ choices: string[]; kind: keyof typeof IMAGE_SIZES; noneLabel: string; round?: boolean; label: string }>()
const model = defineModel<string | null | undefined>()
const { show } = useToast()

const isUpload = (url?: string | null) => !!url?.startsWith('data:')

async function upload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return show('Please pick a JPG, PNG or WebP image.', 'error')
  try {
    model.value = await resizeImage(file, IMAGE_SIZES[props.kind])
  } catch {
    show('Could not read that image. Try another one.', 'error')
  }
}
</script>

<template>
  <div class="thumbs" :class="{ round }" role="group" :aria-label="label">
    <button type="button" class="thumb none" :class="{ on: !model }" @click="model = null">{{ noneLabel }}</button>
    <label class="thumb upload" :class="{ on: isUpload(model) }" title="Upload an image">
      <input type="file" accept="image/jpeg,image/png,image/webp" :aria-label="`Upload ${label.toLowerCase()}`" @change="upload" />
      <img v-if="isUpload(model)" :src="model!" alt="Uploaded" />
      <span v-else-if="round" class="plus" aria-hidden="true">＋</span>
      <span v-else>＋ Upload</span>
    </label>
    <button
      v-for="(url, i) in choices"
      :key="url"
      type="button"
      class="thumb"
      :class="{ on: model === url }"
      :aria-label="`Use image ${i + 1}`"
      @click="model = url"
    >
      <img :src="url" alt="" referrerpolicy="no-referrer" loading="lazy" />
    </button>
  </div>
</template>
