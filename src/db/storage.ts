// ============ 本地持久化层（模拟后端数据库） ============
// 所有写操作集中在此处，便于将来替换为真实 API。

const PREFIX = 'droneshow:'

export function loadTable<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + name)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveTable<T>(name: string, value: T): void {
  localStorage.setItem(PREFIX + name, JSON.stringify(value))
}

export function dropAll(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k))
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
