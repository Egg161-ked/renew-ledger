import type { Subscription } from './types';
import { daysUntil } from './date';

/** 月折算（分，可能含小数，显示时再四舍五入） */
export function monthlyCents(list: Subscription[]): number {
  return list.reduce((s, x) => s + (x.cycle === 'monthly' ? x.amountCents : x.amountCents / 12), 0);
}
export function yearlyCents(list: Subscription[]): number {
  return list.reduce((s, x) => s + (x.cycle === 'monthly' ? x.amountCents * 12 : x.amountCents), 0);
}
export function itemMonthlyCents(x: Subscription): number {
  return x.cycle === 'monthly' ? x.amountCents : x.amountCents / 12;
}
const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatCNY(cents: number): string {
  return '¥' + fmt.format(Math.round(cents) / 100);
}
export interface Reminder { sub: Subscription; days: number }
export function getReminders(list: Subscription[], today: string) {
  const withDays = list.map((sub) => ({ sub, days: daysUntil(sub.nextRenewal, today) }));
  const byDate = (a: Reminder, b: Reminder) => a.days - b.days || a.sub.name.localeCompare(b.sub.name);
  return {
    overdue: withDays.filter((r) => r.days < 0).sort(byDate),
    upcoming: withDays.filter((r) => r.days >= 0 && r.days <= 7).sort(byDate),
  };
}
export function dueLabel(days: number): string {
  if (days < 0) return `已过期 ${-days} 天`;
  if (days === 0) return '今天续费';
  if (days === 1) return '明天续费';
  return `${days} 天后续费`;
}
