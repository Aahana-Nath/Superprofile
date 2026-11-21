<script setup lang="ts">
import type { CreatorDocument } from '~/types/pipeline'

const props = defineProps<{ document: CreatorDocument }>()

const inf = computed(() => props.document.inferred)
const ig = computed(() => props.document.instagram_data)
const qc = computed(() => props.document.quality_control)
const gaps = computed(() => props.document.gaps)

const compact = (n: number | null | undefined) =>
  n == null ? '-' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
</script>

<template>
  <div class="card result">
    <div v-if="ig" class="profile">
      <img v-if="ig.profile_image_url" :src="ig.profile_image_url" alt="" referrerpolicy="no-referrer" class="avatar" />
      <div>
        <h2>
          {{ ig.display_name || ig.username }}
          <span v-if="ig.is_verified" class="chip">verified</span>
        </h2>
        <p class="muted">{{ ig.username }} · {{ compact(ig.follower_count) }} followers · {{ ig.posts.length }} posts read</p>
        <p v-if="ig.bio" class="bio">{{ ig.bio }}</p>
      </div>
    </div>

    <dl class="grid">
      <div v-for="[label, s] in [['Niche', inf.niche], ['Sub-niche', inf.sub_niche], ['Audience', inf.target_audience]] as const" :key="label">
        <dt>{{ label }}</dt>
        <dd>
          {{ s.value || '-' }}
        </dd>
      </div>
      <div>
        <dt>Language</dt>
        <dd>{{ inf.output_language }}</dd>
      </div>
      <div>
        <dt>Engagement</dt>
        <dd>
          {{ inf.engagement_level }}
          <span v-if="ig?.derived_metrics.engagement_rate != null" class="muted">({{ ig.derived_metrics.engagement_rate }}%)</span>
        </dd>
      </div>
      <div v-if="ig">
        <dt>Avg likes / comments</dt>
        <dd>{{ compact(ig.derived_metrics.avg_likes) }} / {{ compact(ig.derived_metrics.avg_comments) }}</dd>
      </div>
    </dl>

    <div v-if="inf.recurring_themes.length" class="block">
      <h3>Recurring themes</h3>
      <div class="chips"><span v-for="t in inf.recurring_themes" :key="t" class="chip">{{ t }}</span></div>
    </div>

    <div v-if="inf.content_tone.length" class="block">
      <h3>Tone</h3>
      <div class="chips"><span v-for="t in inf.content_tone" :key="t" class="chip alt">{{ t }}</span></div>
    </div>

    <div class="block">
      <h3>Verified credentials</h3>
      <ul v-if="document.credibility_claims.length" class="claims">
        <li v-for="c in document.credibility_claims" :key="c.quote">
          <strong>{{ c.claim }}</strong>
          <blockquote>"{{ c.quote }}" <span class="muted">({{ c.source }})</span></blockquote>
        </li>
      </ul>
      <p v-else class="muted">None found.</p>
      <p v-if="gaps.rejected_claims.length" class="muted">{{ gaps.rejected_claims.length }} claim(s) rejected as unverifiable.</p>
    </div>

    <p v-if="qc.inference_status === 'fallback'" class="banner error">
      The LLM failed, so empty fields were returned: {{ qc.last_error }}
    </p>

  </div>
</template>
