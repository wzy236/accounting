// 每种频率一年发生几次（预算常用口径：每周 52 次、每两周 26 次）
export const TIMES_PER_YEAR = { daily: 365, weekly: 52, biweekly: 26, monthly: 12 };

export function yearlyAmount(bill) {
  return Number(bill.amount) * (TIMES_PER_YEAR[bill.frequency] || 0);
}

/** 启用中的定时账单按“月均 / 每年”折算成金额，给分类饼图用（字段跟交易记录一样）。 */
export function billsAsAmounts(bills, period) {
  return bills
    .filter((b) => b.active)
    .map((b) => ({
      type: b.type,
      category_id: b.category_id,
      source: 'recurring',
      amount: period === 'yearly' ? yearlyAmount(b) : yearlyAmount(b) / 12,
    }));
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
