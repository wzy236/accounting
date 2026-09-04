// 定时账单的真实服务器端实现：用 service_role key 一次性扫全部用户的 recurring_bills，
// 跟前端 web/src/lib/api.js 里 generateDueRecurringTransactions() 的算法完全一样，
// 区别只是这里没有“当前登录用户”这个概念，要显式把 user_id 带上、并且一次处理所有用户。

function lastDayOfMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** monthly 超过当月天数时自动取当月最后一天（比如 31 号在 2 月就是 28/29 号）。 */
function computeNextDueDate(fromDateStr, bill) {
  if (bill.frequency === 'daily') return addDays(fromDateStr, 1);
  if (bill.frequency === 'weekly') return addDays(fromDateStr, 7);
  const [y, m] = fromDateStr.split('-').map(Number);
  const year = m === 12 ? y + 1 : y;
  const monthIndex0 = m % 12;
  const day = Math.min(bill.day_of_month, lastDayOfMonth(year, monthIndex0));
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 扫全部用户已到期的定时账单，补生成交易记录，推进 next_due_date。返回本次生成的交易条数。 */
export async function runRecurringBillsSweep(client) {
  const { data: bills, error } = await client.from('recurring_bills').select('*').eq('active', true);
  if (error) throw error;

  const todayStr = todayDateStr();
  let generated = 0;

  for (const bill of bills) {
    let dueDate = bill.next_due_date;
    while (dueDate <= todayStr) {
      const { error: insertError } = await client.from('transactions').insert({
        user_id: bill.user_id,
        date: dueDate,
        type: bill.type,
        amount: bill.amount,
        category_id: bill.category_id,
        account_id: bill.account_id,
        description: bill.name,
        source: 'recurring',
      });
      if (insertError) throw insertError;
      generated += 1;
      dueDate = computeNextDueDate(dueDate, bill);
    }
    if (dueDate !== bill.next_due_date) {
      const { error: updateError } = await client
        .from('recurring_bills')
        .update({ next_due_date: dueDate })
        .eq('id', bill.id);
      if (updateError) throw updateError;
    }
  }

  return generated;
}
