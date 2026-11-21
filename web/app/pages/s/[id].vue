<script setup lang="ts">
import type { Product, PublishedStore } from '~/types/pipeline'

const route = useRoute()
const { show } = useToast()
const { data: store, error } = await useFetch<PublishedStore>(`/api/store/${route.params.id}`)
if (error.value?.statusCode === 404 && import.meta.server) setResponseStatus(useRequestEvent()!, 404)

const origin = useRequestURL().origin
const absolute = (u: string | null | undefined) => (!u ? null : u.startsWith('/') ? `${origin}${u}` : u)

// Open Graph tags drive the link preview card in WhatsApp, Instagram DMs, iMessage, etc.
useHead(() => {
  const s = store.value
  if (!s) return { title: 'Store not found' }
  const description = (s.headline || s.bio || '').slice(0, 160)
  const image = absolute(s.cover_url) ?? absolute(s.avatar_url)
  return {
    title: `${s.name} · Store`,
    meta: [
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'SuperProfile Storefront' },
      { property: 'og:url', content: `${origin}/s/${s.id}` },
      { property: 'og:title', content: `${s.name}${s.products.length ? ` · ${s.products.length} ${s.products.length === 1 ? 'offer' : 'offers'}` : ''}` },
      { property: 'og:description', content: description },
      ...(image
        ? [
            { property: 'og:image', content: image },
            { property: 'og:image:alt', content: s.name },
          ]
        : []),
      { name: 'twitter:card', content: s.cover_url ? 'summary_large_image' : 'summary' },
    ],
  }
})

function onCta(p: Product) {
  show(`Checkout for "${p.title}" isn't switched on in this demo.`)
}

async function share() {
  const url = location.href
  if (navigator.share) {
    try {
      await navigator.share({ title: store.value?.name, url })
    } catch {}
    return
  }
  await navigator.clipboard.writeText(url).catch(() => {})
  show('Link copied')
}
</script>

<template>
  <main class="public">
    <template v-if="store">
      <div class="store-frame">
        <StorePage :store="store" @cta="onCta" />
      </div>
      <footer class="public-foot">
        <button type="button" class="link" @click="share">Share this page</button>
        <span class="muted">Made with SuperProfile Storefront</span>
      </footer>
    </template>
    <div v-else class="container">
      <section class="card notfound">
        <h1>This page doesn't exist</h1>
        <p class="muted">{{ error?.statusCode === 404 ? 'The link may be mistyped, or the page was removed.' : 'We could not load this page. Please try again.' }}</p>
        <NuxtLink to="/" class="primary as-link">Build your own store</NuxtLink>
      </section>
    </div>
  </main>
</template>
