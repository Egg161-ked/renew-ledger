import { describe, it, expect, beforeEach } from 'vitest';
import type { Subscription } from './types';
import { monthlyCents, yearlyCents, formatCNY, getReminders, dueLabel } from './calc';
import { addDays, daysUntil, isValidDateStr, todayStr } from './date';
import { parseAmount, validateForm, formToSub } from './validate';
import { STORAGE_KEY, loadFromStorage, saveToStorage, parseImportText, serializeExport } from './storage';
import { demoData } from './demo';

const sub = (p: Partial<Subscription>): Subscription => ({
  id: Math.random().toString(36), name: 'x', amountCents: 100, cycle: 'monthly',
  nextRenewal: '2026-10-24', category: '其他', ...p,
});
const m30 = sub({ id: 'a', amountCents: 3000, cycle: 'monthly' });
const y120 = sub({ id: 'b', amountCents: 12000, cycle: 'yearly' });
const M = (l: Subscription[]) => formatCNY(monthlyCents(l));
const Y = (l: Subscription[]) => formatCNY(yearlyCents(l));

describe('A 计算', () => {
  it('A1 月付30+年付120 → 40/480', () => { expect(M([m30, y120])).toBe('¥40.00'); expect(Y([m30, y120])).toBe('¥480.00'); });
  it('A2 仅月付30 → 30/360', () => { expect(M([m30])).toBe('¥30.00'); expect(Y([m30])).toBe('¥360.00'); });
  it('A3 仅年付120 → 10/120', () => { expect(M([y120])).toBe('¥10.00'); expect(Y([y120])).toBe('¥120.00'); });
  it('A4 年付100 → 8.33/100', () => { const l = [sub({ amountCents: 10000, cycle: 'yearly' })]; expect(M(l)).toBe('¥8.33'); expect(Y(l)).toBe('¥100.00'); });
  it('A5 0.1+0.2 → 0.30 无浮点长尾', () => {
    const l = [parseAmount('0.1'), parseAmount('0.2')].map((a) => sub({ amountCents: (a as { cents: number }).cents }));
    expect(M(l)).toBe('¥0.30');
  });
  it('A6 空数据 → ¥0.00 不是 NaN', () => { expect(M([])).toBe('¥0.00'); expect(Y([])).toBe('¥0.00'); });
  it('A7 月付30→50 → 60/720', () => { const l = [{ ...m30, amountCents: 5000 }, y120]; expect(M(l)).toBe('¥60.00'); expect(Y(l)).toBe('¥720.00'); });
  it('A8 月付30改年付 → 12.50/150', () => { const l = [{ ...m30, cycle: 'yearly' as const }, y120]; expect(M(l)).toBe('¥12.50'); expect(Y(l)).toBe('¥150.00'); });
  it('A9 删除年付120 → 30/360', () => { const l = [m30, y120].filter((x) => x.id !== 'b'); expect(M(l)).toBe('¥30.00'); expect(Y(l)).toBe('¥360.00'); });
  it('A10 999999.99 千分位无科学计数法', () => {
    const l = [sub({ amountCents: (parseAmount('999999.99') as { cents: number }).cents })];
    expect(M(l)).toBe('¥999,999.99'); expect(Y(l)).toBe('¥11,999,999.88');
  });
});

describe('B 续费提醒', () => {
  const D = '2026-10-24';
  const ids = (l: { sub: Subscription }[]) => l.map((r) => r.sub.id);
  it('B1-B4 边界：今天/第7天在内，第8天不在，昨天为已过期', () => {
    const l = [sub({ id: 'd0', nextRenewal: D }), sub({ id: 'd7', nextRenewal: addDays(D, 7) }),
      sub({ id: 'd8', nextRenewal: addDays(D, 8) }), sub({ id: 'dm1', nextRenewal: addDays(D, -1) })];
    const r = getReminders(l, D);
    expect(ids(r.upcoming)).toEqual(['d0', 'd7']);
    expect(ids(r.overdue)).toEqual(['dm1']);
  });
  it('B5 按日期升序', () => {
    const l = [sub({ id: 'c', nextRenewal: addDays(D, 5) }), sub({ id: 'a', nextRenewal: addDays(D, 1) }), sub({ id: 'b', nextRenewal: addDays(D, 3) })];
    expect(ids(getReminders(l, D).upcoming)).toEqual(['a', 'b', 'c']);
  });
  it('B6 跨年', () => {
    expect(daysUntil('2027-01-03', '2026-12-28')).toBe(6);
    expect(ids(getReminders([sub({ id: 'x', nextRenewal: '2027-01-03' })], '2026-12-28').upcoming)).toEqual(['x']);
    expect(addDays('2026-12-28', 6)).toBe('2027-01-03');
  });
  it('B7 todayStr 使用本地日期而非 UTC', () => {
    const local = new Date(2026, 9, 24, 0, 30); // 本地 00:30
    expect(todayStr(local)).toBe('2026-10-24');
  });
  it('B8 修改日期后提醒变化', () => {
    const s = sub({ id: 'm', nextRenewal: addDays(D, 10) });
    expect(getReminders([s], D).upcoming).toHaveLength(0);
    expect(getReminders([{ ...s, nextRenewal: addDays(D, 2) }], D).upcoming).toHaveLength(1);
  });
  it('文案', () => {
    expect(dueLabel(0)).toBe('今天续费'); expect(dueLabel(1)).toBe('明天续费');
    expect(dueLabel(5)).toBe('5 天后续费'); expect(dueLabel(-3)).toBe('已过期 3 天');
  });
});

describe('C 输入校验', () => {
  const base = { name: 'Netflix', amount: '30', cycle: 'monthly' as const, nextRenewal: '2026-11-01', category: '' };
  it('C1 空名称/仅空格', () => {
    expect(validateForm({ ...base, name: '' }).name).toBe('请输入订阅名称');
    expect(validateForm({ ...base, name: '   ' }).name).toBe('请输入订阅名称');
  });
  it('C2 负数', () => expect(validateForm({ ...base, amount: '-5' }).amount).toBe('金额需大于 0'));
  it('C3 空/abc/1e5/三位小数', () => {
    for (const a of ['', 'abc', '1e5', '1.234', '1,000']) expect(validateForm({ ...base, amount: a }).amount).toBe('金额格式不正确');
    expect(validateForm({ ...base, amount: '1000000.01' }).amount).toBe('金额不能超过 ¥1,000,000');
  });
  it('C4 金额 0 不允许', () => expect(validateForm({ ...base, amount: '0' }).amount).toBe('金额需大于 0'));
  it('C4b 超上限', () => expect(validateForm({ ...base, amount: '1000000.01' }).amount).toBeDefined());
  it('C5 无效日期', () => {
    for (const d of ['', '2026-02-30', '2026-13-01', 'abc']) expect(validateForm({ ...base, nextRenewal: d }).nextRenewal).toBe('请选择有效的续费日期');
    expect(isValidDateStr('2028-02-29')).toBe(true);
  });
  it('C6 超长名称被拒', () => expect(validateForm({ ...base, name: 'a'.repeat(41) }).name).toBeDefined());
  it('C7 合法输入无错误并转换', () => {
    expect(validateForm(base)).toEqual({});
    expect(formToSub({ ...base, name: ' N ' }, 'id1')).toEqual({ id: 'id1', name: 'N', amountCents: 3000, cycle: 'monthly', nextRenewal: '2026-11-01', category: '未分类' });
  });
});

describe('E 持久化', () => {
  beforeEach(() => localStorage.clear());
  it('E1 保存后重新读取一致', () => {
    expect(saveToStorage([m30, y120])).toBe(true);
    const r = loadFromStorage();
    expect(r).toEqual({ status: 'ok', items: [m30, y120] });
  });
  it('E3 非法 JSON → corrupt，且不清空原值', () => {
    localStorage.setItem(STORAGE_KEY, '{oops');
    const r = loadFromStorage();
    expect(r.status).toBe('corrupt');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{oops');
  });
  it('E4 清空 → empty', () => expect(loadFromStorage().status).toBe('empty'));
  it('存储不可用/写入失败', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(loadFromStorage(bad).status).toBe('unavailable');
    expect(saveToStorage([m30], bad)).toBe(false);
    expect(loadFromStorage(null).status).toBe('unavailable');
  });
});

describe('F 导入导出', () => {
  it('F1/F2 导出可重新导入且完全一致', () => {
    const r = parseImportText(serializeExport([m30, y120]));
    expect(r).toEqual({ ok: true, items: [m30, y120] });
  });
  it('F4 非 JSON', () => expect(parseImportText('hello')).toEqual({ ok: false, reason: '不是 JSON' }));
  it('F5 结构错误', () => {
    expect(parseImportText('{"a":1}')).toMatchObject({ ok: false, reason: '缺少 subscriptions 列表' });
    const items = [{ name: 'a', amountCents: 100, cycle: 'monthly', nextRenewal: '2026-01-01' },
      { name: 'b', amountCents: 100, cycle: 'monthly', nextRenewal: '2026-01-01' },
      { name: 'c', amountCents: -5, cycle: 'monthly', nextRenewal: '2026-01-01' }];
    expect(parseImportText(JSON.stringify({ subscriptions: items }))).toEqual({ ok: false, reason: '第 3 条金额无效' });
    expect(parseImportText(JSON.stringify([{ name: 'a', amountCents: 100, cycle: 'monthly', nextRenewal: '2026-02-30' }]))).toEqual({ ok: false, reason: '第 1 条续费日期无效' });
    expect(parseImportText(JSON.stringify([{ amountCents: 100, cycle: 'monthly', nextRenewal: '2026-02-01' }]))).toEqual({ ok: false, reason: '第 1 条缺少名称' });
    expect(parseImportText(JSON.stringify([{ name: 'a', amountCents: 1.5, cycle: 'weekly', nextRenewal: '2026-02-01' }]))).toMatchObject({ ok: false });
  });
  it('F5b 导入失败不写入存储（解析与写入分离）', () => {
    localStorage.clear(); saveToStorage([m30]);
    const r = parseImportText('not json');
    expect(r.ok).toBe(false);
    expect(loadFromStorage()).toEqual({ status: 'ok', items: [m30] });
  });
  it('F6 空数组合法（UI 中确认后清空）', () => expect(parseImportText('{"subscriptions":[]}')).toEqual({ ok: true, items: [] }));
  it('F7 导出空数据不报错', () => expect(JSON.parse(serializeExport([])).subscriptions).toEqual([]));
  it('重复 id 被重新分配', () => {
    const r = parseImportText(JSON.stringify([m30, m30]));
    expect(r.ok && r.items[0].id !== r.items[1].id).toBe(true);
  });
});

describe('G 演示数据', () => {
  it('演示数据全部通过校验并包含提醒与过期', () => {
    const d = demoData('2026-10-24');
    expect(parseImportText(serializeExport(d)).ok).toBe(true);
    const r = getReminders(d, '2026-10-24');
    expect(r.upcoming.length).toBeGreaterThan(0); expect(r.overdue.length).toBeGreaterThan(0);
  });
});
