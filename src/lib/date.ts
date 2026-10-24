const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** 严格校验 YYYY-MM-DD 并拒绝 2026-02-30 之类不存在的日期 */
export function isValidDateStr(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
/** 用户本地日期（不用 toISOString，避免 UTC 偏差） */
export function todayStr(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
function dayNumber(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
/** 续费日期 − 今天（按日期） */
export function daysUntil(date: string, today: string): number {
  return dayNumber(date) - dayNumber(today);
}
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
