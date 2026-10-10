// 每种频率一年发生几次（预算常用口径：每周 52 次、每两周 26 次）
export const TIMES_PER_YEAR = { daily: 365, weekly: 52, biweekly: 26, monthly: 12, yearly: 1 };

export function yearlyAmount(item) {
  return Number(item.amount) * (TIMES_PER_YEAR[item.frequency] || 0);
}

/** 一组 { type, amount, frequency } 的收支合计：每年合计，月均 = 每年 ÷ 12。调用方自己先筛好要算哪些。 */
export function totalsOf(items) {
  let income = 0;
  let expense = 0;
  for (const it of items) {
    if (it.type === 'income') income += yearlyAmount(it);
    else expense += yearlyAmount(it);
  }
  return {
    yearly: { income, expense, net: income - expense },
    monthly: { income: income / 12, expense: expense / 12, net: (income - expense) / 12 },
  };
}

/** 按“月均 / 每年”折算成金额，给分类饼图用（字段跟交易记录一样）。 */
export function asAmounts(items, period) {
  return items.map((it) => ({
    type: it.type,
    category_id: it.category_id,
    source: 'recurring',
    amount: period === 'yearly' ? yearlyAmount(it) : yearlyAmount(it) / 12,
  }));
}

/** 只按启用中的定时账单估算固定收支。 */
export function recurringTotals(bills) {
  return totalsOf(bills.filter((b) => b.active));
}

export function billsAsAmounts(bills, period) {
  return asAmounts(bills.filter((b) => b.active), period);
}

/** 定时账单算不算进预算：停用的不算；in_budget 还没有这一列（没跑新 schema）时默认算。 */
export function billInBudget(bill) {
  return bill.active && bill.in_budget !== false;
}
