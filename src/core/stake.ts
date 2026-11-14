// ---------- 桩号工具 ----------

/** 米 -> "K12+345.0" */
export function formatStake(m: number): string {
  const km = Math.floor(m / 1000);
  const rest = m - km * 1000;
  return `K${km}+${rest.toFixed(1).padStart(4, "0")}`;
}

/** "K12+345" / "12345" -> 米，非法返回 null */
export function parseStake(s: string): number | null {
  const t = s.trim().toUpperCase();
  const m = /^K?(\d+)\+(\d+(?:\.\d+)?)$/.exec(t);
  if (m) return parseInt(m[1], 10) * 1000 + parseFloat(m[2]);
  const n = Number(t);
  if (Number.isFinite(n) && n >= 0) return n;
  return null;
}
