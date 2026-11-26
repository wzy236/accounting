/**
 * 算不算真正的收入/支出。账户间转账、余额调整都只影响账户余额，
 * 不计入收支合计、日历、统计饼图和分类明细。
 */
export const countsAsIncomeExpense = (t) => t.source !== 'transfer' && t.source !== 'adjustment';

/** 一组交易的收入/支出合计，转账和余额调整不算真正的收支。 */
export function dayTotals(items) {
  let income = 0;
  let expense = 0;
  for (const t of items) {
    if (!countsAsIncomeExpense(t)) continue;
    if (t.type === 'income') income += Number(t.amount);
    else expense += Number(t.amount);
  }
  return { income, expense };
}

/** 按日期分组，保持传入的顺序（列表接口已经按日期倒序排好）。 */
export function groupByDate(transactions) {
  const groups = new Map();
  for (const t of transactions) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  return [...groups.entries()];
}
