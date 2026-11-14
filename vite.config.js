import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { port: 5233, strictPort: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 4000 },
});
