const PREFIX = 'bdst:'; // blood-draw skeletal trainer

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('读取本地数据失败', key, err);
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn('写入本地数据失败', key, err);
  }
}

export function removeKey(key: string): void {
  localStorage.removeItem(PREFIX + key);
}

export const STORAGE_KEYS = {
  role: 'role',
  students: 'students',
  assignments: 'assignments',
  coursewares: 'coursewares',
  submissions: 'submissions',
  drafts: 'drafts',
  seeded: 'seeded-v2',
} as const;
