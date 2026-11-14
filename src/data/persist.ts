import type { AppState } from '../core/types';
import { createSeedState } from './seed';

const STORAGE_KEY = 'mms.state.v1';

export interface PersistResult {
  state: AppState;
  restored: boolean;
  error?: string;
}

export function loadState(): PersistResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: createSeedState(), restored: false };
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.projects)) {
      return { state: createSeedState(), restored: false, error: '存档格式不兼容，已载入示例数据。' };
    }
    return { state: parsed, restored: true };
  } catch (err) {
    return {
      state: createSeedState(),
      restored: false,
      error: `读取本地存档失败：${(err as Error).message}`,
    };
  }
}

export function saveState(state: AppState): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message;
    return { ok: false, error: message.includes('quota') ? '本地存储空间不足，请清理已交付的打包记录。' : message };
  }
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportStateJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importStateJson(text: string): { state?: AppState; error?: string } {
  try {
    const parsed = JSON.parse(text) as AppState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.shots)) {
      return { error: '文件不是有效的项目存档（缺少 version/projects/shots）。' };
    }
    return { state: parsed };
  } catch (err) {
    return { error: `解析失败：${(err as Error).message}` };
  }
}
