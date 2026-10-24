import type { Subscription } from './types';
import { addDays, todayStr } from './date';
import { newId } from './storage';

/** 演示数据：日期相对今天生成，以便展示提醒与过期状态 */
export function demoData(today = todayStr()): Subscription[] {
  const d = (n: number) => addDays(today, n);
  return [
    { name: '视频会员', amountCents: 2500, cycle: 'monthly', nextRenewal: d(0), category: '影音' },
    { name: '音乐会员', amountCents: 1500, cycle: 'monthly', nextRenewal: d(3), category: '影音' },
    { name: '云盘 2TB', amountCents: 21800, cycle: 'yearly', nextRenewal: d(6), category: '云存储' },
    { name: '笔记软件', amountCents: 19800, cycle: 'yearly', nextRenewal: d(45), category: '软件工具' },
    { name: '外语学习 App', amountCents: 3000, cycle: 'monthly', nextRenewal: d(-2), category: '学习' },
    { name: '外卖会员', amountCents: 1000, cycle: 'monthly', nextRenewal: d(18), category: '生活' },
  ].map((x) => ({ ...x, id: newId() }) as Subscription);
}
