/** 一组交易的收入/支出合计，转账不算真正的收支。 */
export function dayTotals(items) {
  let income = 0;
  let expense = 0;
  for (const t of items) {
    if (t.source === 'transfer') continue;
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
