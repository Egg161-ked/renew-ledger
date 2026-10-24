export type Cycle = 'monthly' | 'yearly';
export interface Subscription {
  id: string;
  name: string;
  /** 金额，单位：分（整数，避免浮点误差） */
  amountCents: number;
  cycle: Cycle;
  /** 下次续费日期 YYYY-MM-DD（本地日期） */
  nextRenewal: string;
  category: string;
}
