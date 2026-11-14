<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useStore } from '@/store'

const store = useStore()
onMounted(() => store.boot())
</script>
