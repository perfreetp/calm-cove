import { reactive } from 'vue';
import { loadFont } from './core/font.js';

export * from './core/store.js';
export { legibility, layerSubpaths, layerBBox, CATEGORIES, PRIMITIVES, TEMPLATES, PALETTE } from './core/model.js';

export const fontState = reactive({ ready: false, error: null });

export async function loadFontReady() {
  try {
    await loadFont();
    fontState.ready = true;
  } catch (e) {
    fontState.error = e.message;
  }
}
