import type { Cycle, Subscription } from './types';
import { isValidDateStr } from './date';

export interface FormInput { name: string; amount: string; cycle: Cycle; nextRenewal: string; category: string }
export type FormErrors = Partial<Record<'name' | 'amount' | 'nextRenewal', string>>;
export const MAX_AMOUNT_CENTS = 100_000_000; // ¥1,000,000

/** 解析金额字符串为分；非法返回错误文案 */
export function parseAmount(raw: string): { cents: number } | { error: string } {
  const s = raw.trim();
  if (s === '') return { error: '金额格式不正确' };
  if (/^-/.test(s)) return { error: '金额需大于 0' };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: '金额格式不正确' };
  const [i, f = ''] = s.split('.');
  const cents = Number(i) * 100 + Number(f.padEnd(2, '0'));
  if (cents <= 0) return { error: '金额需大于 0' };
  if (cents > MAX_AMOUNT_CENTS) return { error: '金额不能超过 ¥1,000,000' };
  return { cents };
}
export function validateForm(f: FormInput): FormErrors {
  const e: FormErrors = {};
  const name = f.name.trim();
  if (!name) e.name = '请输入订阅名称';
  else if ([...name].length > 40) e.name = '名称不能超过 40 个字';
  const a = parseAmount(f.amount);
  if ('error' in a) e.amount = a.error;
  if (!isValidDateStr(f.nextRenewal)) e.nextRenewal = '请选择有效的续费日期';
  return e;
}
export function formToSub(f: FormInput, id: string): Subscription {
  const a = parseAmount(f.amount);
  if ('error' in a) throw new Error(a.error);
  return { id, name: f.name.trim(), amountCents: a.cents, cycle: f.cycle, nextRenewal: f.nextRenewal, category: f.category.trim() || '未分类' };
}
