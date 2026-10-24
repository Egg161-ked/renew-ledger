import type { Subscription } from './types';
import { isValidDateStr } from './date';
import { MAX_AMOUNT_CENTS } from './validate';

export const STORAGE_KEY = 'subscription-manager:v1';
export const EXPORT_VERSION = 1;

export type ParseResult = { ok: true; items: Subscription[] } | { ok: false; reason: string };

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 校验任意数据为订阅数组（导入与读取存储共用）。接受 {version, subscriptions:[...]} 或纯数组 */
export function parseSubscriptions(data: unknown): ParseResult {
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { subscriptions?: unknown }).subscriptions)
      ? (data as { subscriptions: unknown[] }).subscriptions
      : null;
  if (!arr) return { ok: false, reason: '缺少 subscriptions 列表' };
  const items: Subscription[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < arr.length; i++) {
    const n = i + 1;
    const r = arr[i] as Record<string, unknown>;
    if (!r || typeof r !== 'object') return { ok: false, reason: `第 ${n} 条不是对象` };
    if (typeof r.name !== 'string' || !r.name.trim()) return { ok: false, reason: `第 ${n} 条缺少名称` };
    const c = r.amountCents;
    if (typeof c !== 'number' || !Number.isInteger(c) || c <= 0 || c > MAX_AMOUNT_CENTS)
      return { ok: false, reason: `第 ${n} 条金额无效` };
    if (r.cycle !== 'monthly' && r.cycle !== 'yearly') return { ok: false, reason: `第 ${n} 条计费周期无效` };
    if (!isValidDateStr(r.nextRenewal)) return { ok: false, reason: `第 ${n} 条续费日期无效` };
    if (r.category !== undefined && typeof r.category !== 'string') return { ok: false, reason: `第 ${n} 条分类无效` };
    let id = typeof r.id === 'string' && r.id ? r.id : newId();
    if (ids.has(id)) id = newId();
    ids.add(id);
    items.push({
      id, name: r.name.trim().slice(0, 40), amountCents: c, cycle: r.cycle,
      nextRenewal: r.nextRenewal, category: (typeof r.category === 'string' && r.category.trim()) || '未分类',
    });
  }
  return { ok: true, items };
}

export function parseImportText(text: string): ParseResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: '不是 JSON' }; }
  return parseSubscriptions(data);
}

export function serializeExport(items: Subscription[], now = new Date()): string {
  return JSON.stringify({ app: 'subscription-manager', version: EXPORT_VERSION, exportedAt: now.toISOString(), subscriptions: items }, null, 2);
}

export type LoadResult =
  | { status: 'ok'; items: Subscription[] }
  | { status: 'empty' }
  | { status: 'corrupt'; raw: string; reason: string }
  | { status: 'unavailable' };

export function loadFromStorage(storage: Storage | null = safeStorage()): LoadResult {
  if (!storage) return { status: 'unavailable' };
  let raw: string | null;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { status: 'unavailable' }; }
  if (raw === null) return { status: 'empty' };
  const r = parseImportText(raw);
  return r.ok ? { status: 'ok', items: r.items } : { status: 'corrupt', raw, reason: r.reason };
}

/** 返回是否写入成功 */
export function saveToStorage(items: Subscription[], storage: Storage | null = safeStorage()): boolean {
  if (!storage) return false;
  try { storage.setItem(STORAGE_KEY, serializeExport(items)); return true; } catch { return false; }
}

export function safeStorage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export { newId };
