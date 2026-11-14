<template>
  <div v-if="store.toast" class="host" :class="store.toast.tone">
    <span class="dot" />
    <span>{{ store.toast.message }}</span>
  </div>
</template>

<script setup>
import { store } from '../composables';
</script>

<style scoped>
.host {
  position: fixed;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 16px;
  background: #10151c;
  border: 1px solid var(--line);
  border-radius: 9px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5);
  font-size: 12.5px;
  z-index: 999;
  animation: pop .16s ease-out;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
.host.success .dot { background: var(--green); }
.host.warn .dot { background: var(--amber); }
.host.error .dot { background: var(--red); }
@keyframes pop {
  from { opacity: 0; transform: translate(-50%, 6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
</style>
