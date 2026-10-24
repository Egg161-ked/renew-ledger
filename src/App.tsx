import { useEffect, useMemo, useRef, useState } from 'react';
import type { Subscription } from './lib/types';
import { dueLabel, formatCNY, getReminders, itemMonthlyCents, monthlyCents, yearlyCents } from './lib/calc';
import { daysUntil, todayStr } from './lib/date';
import { loadFromStorage, newId, parseImportText, saveToStorage, serializeExport } from './lib/storage';
import { demoData } from './lib/demo';
import { formToSub, type FormInput } from './lib/validate';
import SubscriptionForm from './SubscriptionForm';
import Modal from './Modal';

type Dialog =
  | { kind: 'form'; editing?: Subscription }
  | { kind: 'delete'; sub: Subscription }
  | { kind: 'import'; items: Subscription[] }
  | { kind: 'demo' }
  | null;

const initial = loadFromStorage();

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [subs, setSubs] = useState<Subscription[]>(initial.status === 'ok' ? initial.items : []);
  const [saveFailed, setSaveFailed] = useState(initial.status === 'unavailable');
  const [corruptRaw, setCorruptRaw] = useState<string | null>(initial.status === 'corrupt' ? initial.raw : null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [today, setToday] = useState(todayStr());
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();

  // 跨午夜/回到页面时刷新“今天”
  useEffect(() => {
    const tick = () => setToday(todayStr());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };
  const commit = (next: Subscription[], msg?: string) => {
    setSubs(next);
    const ok = saveToStorage(next);
    setSaveFailed(!ok);
    if (ok) setCorruptRaw(null);
    if (msg) showToast(msg);
  };

  const categories = useMemo(() => [...new Set(subs.map((s) => s.category))].sort((a, b) => a.localeCompare(b, 'zh')), [subs]);
  useEffect(() => { if (category && !categories.includes(category)) setCategory(''); }, [categories, category]);
  const sorted = useMemo(() => [...subs].sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal) || a.name.localeCompare(b.name)), [subs]);
  const filtered = sorted.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()) && (!category || s.category === category));
  const { overdue, upcoming } = getReminders(subs, today);
  const filtering = query.trim() !== '' || category !== '';

  const onSave = (f: FormInput) => {
    if (dialog?.kind !== 'form') return;
    const editing = dialog.editing;
    const s = formToSub(f, editing?.id ?? newId());
    setDialog(null);
    commit(editing ? subs.map((x) => (x.id === s.id ? s : x)) : [...subs, s], editing ? '已保存' : '已添加');
  };
  const onExport = () => { if (subs.length) download(`subscriptions-${todayStr()}.json`, serializeExport(subs)); };
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let text: string;
    try { text = await file.text(); } catch { setImportError('无法读取文件'); return; }
    const r = parseImportText(text);
    if (!r.ok) { setImportError(r.reason); return; }
    setImportError(null);
    if (subs.length === 0) commit(r.items, `已导入 ${r.items.length} 条订阅`);
    else setDialog({ kind: 'import', items: r.items });
  };
  const onDemo = () => (subs.length ? setDialog({ kind: 'demo' }) : commit(demoData(today), '已加载演示数据'));
  const openImport = () => fileRef.current?.click();
  const exportBtn = (cls: string) => (
    <button className={cls} onClick={onExport} disabled={!subs.length} title={subs.length ? '导出 JSON 备份' : '暂无可导出的数据'}>导出</button>
  );

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <h1 className="logo">续费账本</h1>
          <div className="header-actions">
            <button className="btn desktop-only" onClick={openImport}>导入</button>
            {exportBtn('btn desktop-only')}
            <button className="btn btn-primary" onClick={() => setDialog({ kind: 'form' })}>+ 添加<span className="desktop-only-inline">订阅</span></button>
          </div>
        </div>
      </header>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onPickFile} aria-hidden tabIndex={-1} />

      <main className="container main">
        <p className="notice" role="note">
          数据仅保存在当前浏览器中，清除浏览器数据或更换设备会丢失，请定期导出备份。
          {subs.length > 0 && <button className="link" onClick={onExport}>导出备份</button>}
        </p>

        {saveFailed && <div className="banner banner-danger" role="alert">无法保存到浏览器存储（可能是隐私模式或空间已满），本次修改刷新后会丢失。</div>}
        {corruptRaw !== null && (
          <div className="banner banner-danger" role="alert">
            本地数据读取失败，当前以空列表运行；原数据未被清除，但新的修改会覆盖它。
            <button className="link link-danger" onClick={() => download(`subscriptions-raw-${todayStr()}.txt`, corruptRaw)}>导出原始数据</button>
          </div>
        )}
        {importError && (
          <div className="banner banner-danger" role="alert">
            导入失败：文件不是有效的订阅数据（{importError}）。当前数据未改动。
            <button className="link link-danger" onClick={() => setImportError(null)} aria-label="关闭导入错误提示">知道了</button>
          </div>
        )}

        <section className="reminders" aria-label="续费提醒">
          {overdue.length === 0 && upcoming.length === 0 ? (
            <p className="ok-line">未来 7 天没有续费 ✓</p>
          ) : (
            <>
              {overdue.length > 0 && (
                <div className="rem-group rem-danger">
                  <h2 className="section-title">已过期</h2>
                  <ul>{overdue.map(({ sub, days }) => (
                    <li key={sub.id}><span className="rem-name">{sub.name}</span><span>已过期 {-days} 天，请更新续费日期</span>
                      <button className="link" onClick={() => setDialog({ kind: 'form', editing: sub })}>编辑</button></li>
                  ))}</ul>
                </div>
              )}
              {upcoming.length > 0 && (
                <div className="rem-group rem-warning">
                  <h2 className="section-title">7 天内续费</h2>
                  <ul>{upcoming.map(({ sub, days }) => (
                    <li key={sub.id}><span className="rem-name">{sub.name}</span><span>{dueLabel(days)} · <span className="num">{formatCNY(sub.amountCents)}</span></span></li>
                  ))}</ul>
                </div>
              )}
            </>
          )}
        </section>

        <section className="stats" aria-label="统计">
          <div className="stat"><div className="stat-label">月折算合计</div><div className="stat-value num">{formatCNY(monthlyCents(subs))}</div></div>
          <div className="stat"><div className="stat-label">年折算合计</div><div className="stat-value num">{formatCNY(yearlyCents(subs))}</div></div>
          <div className="stat"><div className="stat-label">订阅数量</div><div className="stat-value num">{subs.length}</div></div>
        </section>
        <p className="hint">月付按原价，年付 ÷12{filtering && '；统计为全部订阅'}</p>

        {subs.length === 0 ? (
          <section className="empty">
            <div className="empty-icon" aria-hidden>📦</div>
            <p className="empty-title">还没有订阅</p>
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => setDialog({ kind: 'form' })}>添加第一个订阅</button>
              <button className="btn" onClick={onDemo}>加载演示数据</button>
            </div>
          </section>
        ) : (
          <section aria-label="订阅列表">
            <div className="toolbar">
              <div className="search">
                <input type="search" aria-label="按名称搜索" placeholder="按名称搜索" value={query} onChange={(e) => setQuery(e.target.value)} />
                {query && <button className="clear" aria-label="清除搜索" onClick={() => setQuery('')}>×</button>}
              </div>
              <select aria-label="按分类筛选" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">全部分类</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="empty small">
                <p>没有匹配{query.trim() ? `「${query.trim()}」` : '当前筛选'}的订阅</p>
                <button className="btn" onClick={() => { setQuery(''); setCategory(''); }}>清除筛选</button>
              </div>
            ) : (
              <ul className="list">
                {filtered.map((s) => {
                  const d = daysUntil(s.nextRenewal, today);
                  return (
                    <li key={s.id} className="row">
                      <div className="c-name"><span className="name" title={s.name}>{s.name}</span><span className="tag">{s.category}</span></div>
                      <div className="c-amount num">{formatCNY(s.amountCents)} / {s.cycle === 'monthly' ? '月' : '年'}</div>
                      <div className={`c-monthly num${s.cycle === 'yearly' ? '' : ' c-monthly-dash'}`} aria-label={s.cycle === 'yearly' ? undefined : '月付，无需折算'}>{s.cycle === 'yearly' ? `≈${formatCNY(itemMonthlyCents(s))}/月` : '—'}</div>
                      <div className="c-date">
                        <span className="num">{s.nextRenewal}</span>
                        {d < 0 && <span className="badge badge-danger">已过期</span>}
                        {d >= 0 && d <= 7 && <span className="badge badge-warning">{d === 0 ? '今天' : `${d}天内`}</span>}
                      </div>
                      <div className="c-actions">
                        <button className="icon-btn" aria-label={`编辑 ${s.name}`} title="编辑" onClick={() => setDialog({ kind: 'form', editing: s })}>
                          <span aria-hidden className="desktop-only-inline">✎</span><span className="mobile-only-inline">编辑</span></button>
                        <button className="icon-btn danger" aria-label={`删除 ${s.name}`} title="删除" onClick={() => setDialog({ kind: 'delete', sub: s })}>
                          <span aria-hidden className="desktop-only-inline">🗑</span><span className="mobile-only-inline">删除</span></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>

      <footer className="container footer">
        <div className="footer-actions">
          <button className="btn-text mobile-only-inline" onClick={openImport}>导入</button>
          {exportBtn('btn-text mobile-only-inline')}
          <button className="btn-text" onClick={onDemo}>加载演示数据</button>
        </div>
        <p>续费账本 v1.0 · 纯前端，数据不上传</p>
      </footer>

      {dialog?.kind === 'form' && (
        <SubscriptionForm initial={dialog.editing} categories={categories} onSave={onSave} onCancel={() => setDialog(null)} />
      )}
      {dialog?.kind === 'delete' && (
        <Modal title={`删除「${dialog.sub.name}」？`} onClose={() => setDialog(null)}
          footer={<><button className="btn" data-autofocus onClick={() => setDialog(null)}>取消</button>
            <button className="btn btn-danger" onClick={() => { const id = dialog.sub.id; setDialog(null); commit(subs.filter((x) => x.id !== id), '已删除'); }}>删除</button></>}>
          <p>删除后无法恢复。</p>
        </Modal>
      )}
      {dialog?.kind === 'import' && (
        <Modal title="确认导入" onClose={() => setDialog(null)}
          footer={<><button className="btn" data-autofocus onClick={() => setDialog(null)}>取消</button>
            <button className="btn btn-danger" onClick={() => { const items = dialog.items; setDialog(null); commit(items, `已导入 ${items.length} 条订阅`); }}>替换</button></>}>
          <p>导入将替换当前 {subs.length} 条订阅为文件中的 {dialog.items.length} 条，确定吗？</p>
        </Modal>
      )}
      {dialog?.kind === 'demo' && (
        <Modal title="加载演示数据" onClose={() => setDialog(null)}
          footer={<><button className="btn" data-autofocus onClick={() => setDialog(null)}>取消</button>
            <button className="btn btn-danger" onClick={() => { setDialog(null); commit(demoData(today), '已加载演示数据'); }}>替换</button></>}>
          <p>将用演示数据替换当前 {subs.length} 条订阅，确定吗？</p>
        </Modal>
      )}
      <div className="toast-wrap" aria-live="polite">{toast && <div className="toast">{toast}</div>}</div>
    </>
  );
}
