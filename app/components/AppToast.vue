<script setup lang="ts">
const { toast } = useToast()
</script>

<template>
  <Transition name="toast">
    <div v-if="toast" :key="toast.id" class="toast" :class="toast.kind" role="status">{{ toast.text }}</div>
  </Transition>
</template>
