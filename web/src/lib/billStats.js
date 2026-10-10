// 每种频率一年发生几次（预算常用口径：每周 52 次、每两周 26 次）
export const TIMES_PER_YEAR = { daily: 365, weekly: 52, biweekly: 26, monthly: 12 };

export function yearlyAmount(bill) {
  return Number(bill.amount) * (TIMES_PER_YEAR[bill.frequency] || 0);
}

/** 只按启用中的定时账单估算固定收支：每年合计，月均 = 每年 ÷ 12。 */
export function recurringTotals(bills) {
  let income = 0;
  let expense = 0;
  for (const b of bills) {
    if (!b.active) continue;
    if (b.type === 'income') income += yearlyAmount(b);
    else expense += yearlyAmount(b);
  }
  return {
    yearly: { income, expense, net: income - expense },
    monthly: { income: income / 12, expense: expense / 12, net: (income - expense) / 12 },
  };
}
