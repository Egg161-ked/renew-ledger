import { useRef, useState } from 'react';
import Modal from './Modal';
import type { Subscription } from './lib/types';
import { validateForm, type FormErrors, type FormInput } from './lib/validate';
import { todayStr } from './lib/date';

export const PRESET_CATEGORIES = ['影音', '软件工具', '云存储', '学习', '生活', '其他'];

interface Props {
  initial?: Subscription;
  categories: string[];
  onSave: (f: FormInput) => void;
  onCancel: () => void;
}

function toInput(s?: Subscription): FormInput {
  if (!s) return { name: '', amount: '', cycle: 'monthly', nextRenewal: todayStr(), category: '' };
  return { name: s.name, amount: (s.amountCents / 100).toFixed(2), cycle: s.cycle, nextRenewal: s.nextRenewal, category: s.category === '未分类' ? '' : s.category };
}

export default function SubscriptionForm({ initial, categories, onSave, onCancel }: Props) {
  const start = useRef(toInput(initial));
  const [f, setF] = useState<FormInput>(start.current);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const set = <K extends keyof FormInput>(k: K, v: FormInput[K]) => {
    const next = { ...f, [k]: v };
    setF(next);
    if (submitted) {
      const e = validateForm(next);
      // 仅对已出错字段实时复检
      setErrors((prev) => { const out: FormErrors = {}; for (const key of Object.keys(prev) as (keyof FormErrors)[]) if (e[key]) out[key] = e[key]; return out; });
    }
  };
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    const e = validateForm(f);
    setErrors(e);
    const firstKey = (['name', 'amount', 'nextRenewal'] as const).find((k) => e[k]);
    if (firstKey) { formRef.current?.querySelector<HTMLInputElement>(`[name="${firstKey}"]`)?.focus(); return; }
    onSave(f);
  };
  const dirty = JSON.stringify(f) !== JSON.stringify(start.current);
  const requestClose = () => (dirty ? setConfirmDiscard(true) : onCancel());
  const cats = [...new Set([...PRESET_CATEGORIES, ...categories.filter((c) => c !== '未分类')])];

  if (confirmDiscard) {
    return (
      <Modal title="放弃未保存的修改？" onClose={() => setConfirmDiscard(false)}
        footer={<><button className="btn" data-autofocus onClick={() => setConfirmDiscard(false)}>继续编辑</button><button className="btn btn-danger" onClick={onCancel}>放弃</button></>}>
        <p>你填写的内容尚未保存。</p>
      </Modal>
    );
  }

  return (
    <Modal title={initial ? '编辑订阅' : '添加订阅'} onClose={requestClose}
      footer={<><button type="button" className="btn" onClick={requestClose}>取消</button><button type="submit" form="sub-form" className="btn btn-primary">保存</button></>}>
      <form id="sub-form" ref={formRef} onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="f-name">名称</label>
          <input id="f-name" name="name" data-autofocus className={errors.name ? 'invalid' : ''} maxLength={40} value={f.name}
            aria-invalid={!!errors.name} aria-describedby="e-name" onChange={(e) => set('name', e.target.value)} placeholder="例如：视频会员" />
          {errors.name && <div id="e-name" className="err">{errors.name}</div>}
        </div>
        <div className="field">
          <label htmlFor="f-amount">金额 (CNY)</label>
          <div className={'prefix-input' + (errors.amount ? ' invalid' : '')}>
            <span aria-hidden>¥</span>
            <input id="f-amount" name="amount" inputMode="decimal" value={f.amount} aria-invalid={!!errors.amount} aria-describedby="e-amount"
              onChange={(e) => set('amount', e.target.value)} placeholder="0.00" />
          </div>
          {errors.amount && <div id="e-amount" className="err">{errors.amount}</div>}
        </div>
        <div className="field">
          <span className="label" id="l-cycle">计费周期</span>
          <div className="segmented" role="radiogroup" aria-labelledby="l-cycle">
            {(['monthly', 'yearly'] as const).map((c) => (
              <button type="button" key={c} role="radio" aria-checked={f.cycle === c} className={f.cycle === c ? 'on' : ''} onClick={() => set('cycle', c)}>
                {c === 'monthly' ? '月付' : '年付'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="f-date">下次续费日期</label>
          <input id="f-date" name="nextRenewal" type="date" className={errors.nextRenewal ? 'invalid' : ''} value={f.nextRenewal}
            aria-invalid={!!errors.nextRenewal} aria-describedby="e-date" onChange={(e) => set('nextRenewal', e.target.value)} />
          {errors.nextRenewal && <div id="e-date" className="err">{errors.nextRenewal}</div>}
        </div>
        <div className="field">
          <label htmlFor="f-cat">分类（选填）</label>
          <input id="f-cat" name="category" list="cat-list" maxLength={20} value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="未分类" />
          <datalist id="cat-list">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </form>
    </Modal>
  );
}
