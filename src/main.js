import { createApp } from 'vue';
import App from './App.vue';
import './styles/main.css';
import * as storeMod from './core/store.js';

createApp(App).mount('#app');

// Exposed for automated UI checks and for troubleshooting in the browser console.
if (import.meta.env.DEV) {
  window.__bbt = { ...storeMod };
}
