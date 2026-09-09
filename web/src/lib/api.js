// 业务接口层：每个函数第一个参数都是 supabase-js client（来自 useSupabase() 的 context），
// 用的是官方 SDK 的查询构造器，权限仍然靠数据库那边的 RLS 策略保证，跟静态站点版本原理一致。

export const DEFAULT_CATEGORIES = [
  { name: '餐饮', type: 'expense', color: '#e07a5f' },
  { name: '交通', type: 'expense', color: '#3d5a80' },
  { name: '购物', type: 'expense', color: '#f2cc8f' },
  { name: '娱乐', type: 'expense', color: '#81b29a' },
  { name: '住房', type: 'expense', color: '#6d597a' },
  { name: '医疗', type: 'expense', color: '#b56576' },
  { name: '其他支出', type: 'expense', color: '#8d99ae' },
  { name: '工资', type: 'income', color: '#4caf50' },
  { name: '奖金', type: 'income', color: '#2a9d8f' },
  { name: '理财', type: 'income', color: '#457b9d' },
  { name: '其他收入', type: 'income', color: '#a8dadc' },
];

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/* ================= 分类 ================= */

export async function listCategories(client) {
  return unwrap(await client.from('categories').select('*').order('type').order('name'));
}

/** 新用户首次登录时，如果还没有任何分类，写入一套默认分类。 */
export async function ensureDefaultCategories(client) {
  const existing = await listCategories(client);
  if (existing.length > 0) return existing;
  unwrap(await client.from('categories').insert(DEFAULT_CATEGORIES).select());
  return listCategories(client);
}

export async function createCategory(client, { name, type, color, parent_id }) {
  return unwrap(await client.from('categories').insert({ name, type, color, parent_id: parent_id || null }).select());
}

export async function deleteCategory(client, id) {
  return unwrap(await client.from('categories').delete().eq('id', id));
}

/* ================= 记账 ================= */

function monthRange(monthStr) {
  const start = `${monthStr}-01`;
  const [y, m] = monthStr.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start, end: `${nextMonth}-01` };
}

export async function listTransactionsForMonth(client, monthStr) {
  const { start, end } = monthRange(monthStr);
  const rows = unwrap(
    await client
      .from('transactions')
      .select('*, categories(id,name,color), accounts(id,name)')
      .gte('date', start)
      .lt('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
  );
  return rows.map((r) => ({
    ...r,
    category_name: r.categories?.name || null,
    category_color: r.categories?.color || null,
    account_name: r.accounts?.name || null,
  }));
}

export async function createTransaction(client, { date, type, amount, category_id, account_id, description, source }) {
  return unwrap(
    await client
      .from('transactions')
      .insert({
        date, type, amount,
        category_id: category_id || null,
        account_id: account_id || null,
        description: description || '',
        source: source || 'manual',
      })
      .select()
  );
}

export async function updateTransaction(client, id, fields) {
  return unwrap(await client.from('transactions').update(fields).eq('id', id).select());
}

export async function deleteTransaction(client, id) {
  return unwrap(await client.from('transactions').delete().eq('id', id));
}

export async function createTransactionsBulk(client, rows) {
  return unwrap(await client.from('transactions').insert(rows).select());
}

/** 按分类聚合某月的收入/支出总额，供饼图使用（客户端聚合，数据量不大够用）。转账不算真正的收支，排除掉。 */
export function aggregateByCategory(transactions, type) {
  const totals = new Map();
  for (const t of transactions) {
    if (t.type !== type || t.source === 'transfer') continue;
    const key = t.category_id || 'none';
    const name = t.category_name || '未分类';
    const color = t.category_color || '#8d99ae';
    const entry = totals.get(key) || { name, color, total: 0 };
    entry.total += Number(t.amount);
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total);
}

/* ================= 账户（银行卡 / 信用卡） ================= */

export async function listAccounts(client) {
  return unwrap(await client.from('accounts').select('*').order('type').order('name'));
}

export async function createAccount(client, { name, type, initial_balance, color }) {
  return unwrap(await client.from('accounts').insert({ name, type, initial_balance: initial_balance || 0, color }).select());
}

export async function updateAccount(client, id, fields) {
  return unwrap(await client.from('accounts').update(fields).eq('id', id).select());
}

export async function deleteAccount(client, id) {
  return unwrap(await client.from('accounts').delete().eq('id', id));
}

/** 每个账户的当前余额 = 初始余额 + 关联到该账户的收入 - 支出。 */
export async function getAccountBalances(client) {
  const accounts = await listAccounts(client);
  if (accounts.length === 0) return [];
  const txs = unwrap(
    await client.from('transactions').select('account_id,type,amount').not('account_id', 'is', null)
  );
  const deltas = new Map();
  for (const t of txs) {
    const delta = t.type === 'income' ? Number(t.amount) : -Number(t.amount);
    deltas.set(t.account_id, (deltas.get(t.account_id) || 0) + delta);
  }
  return accounts.map((a) => ({
    ...a,
    balance: Number(a.initial_balance) + (deltas.get(a.id) || 0),
  }));
}

/**
 * 把账户余额调整到 targetBalance：按差额补一笔收入/支出交易（source: 'adjustment'），
 * 而不是直接改数字，这样余额的每次变动都在记账记录里留痕。差额为 0 时什么都不做。
 */
export async function adjustAccountBalance(client, accountId, currentBalance, targetBalance) {
  const delta = Number(targetBalance) - Number(currentBalance);
  if (delta === 0) return null;
  return createTransaction(client, {
    date: todayDateStr(),
    type: delta > 0 ? 'income' : 'expense',
    amount: Math.abs(delta),
    account_id: accountId,
    description: '余额调整',
    source: 'adjustment',
  });
}

/**
 * 账户间转账：记一对交易（源账户支出 + 目标账户收入），source 都标成 'transfer'。
 * 两条记录用一次批量插入发出去，数据库那边是同一条 INSERT 语句，不会出现只写成功一半的情况。
 * 转账不算真正的收入/支出，月度统计和饼图里会把 source: 'transfer' 的记录排除掉。
 */
export async function createTransfer(client, { date, fromAccountId, fromAccountName, toAccountId, toAccountName, amount, description }) {
  const note = description ? `：${description}` : '';
  return createTransactionsBulk(client, [
    {
      date, type: 'expense', amount,
      account_id: fromAccountId,
      category_id: null,
      description: `转账到「${toAccountName}」${note}`,
      source: 'transfer',
    },
    {
      date, type: 'income', amount,
      account_id: toAccountId,
      category_id: null,
      description: `转账自「${fromAccountName}」${note}`,
      source: 'transfer',
    },
  ]);
}

/* ================= 定时账单 ================= */

export async function listRecurringBills(client) {
  return unwrap(
    await client
      .from('recurring_bills')
      .select('*, categories(id,name,color), accounts(id,name)')
      .order('next_due_date')
  );
}

export async function createRecurringBill(client, { name, type, amount, category_id, account_id, frequency, day_of_week, day_of_month, next_due_date }) {
  return unwrap(
    await client
      .from('recurring_bills')
      .insert({
        name, type, amount,
        category_id: category_id || null,
        account_id: account_id || null,
        frequency,
        day_of_week: frequency === 'weekly' ? day_of_week : null,
        day_of_month: frequency === 'monthly' ? day_of_month : null,
        next_due_date,
        active: true,
      })
      .select()
  );
}

export async function updateRecurringBill(client, id, fields) {
  return unwrap(await client.from('recurring_bills').update(fields).eq('id', id).select());
}

export async function deleteRecurringBill(client, id) {
  return unwrap(await client.from('recurring_bills').delete().eq('id', id));
}

function lastDayOfMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** 根据账单的频率算出下一次到期日期；monthly 超过当月天数时自动取当月最后一天。 */
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

/**
 * 补生成所有已到期但还没生成交易记录的定时账单。现在有 server/ 里的后端 cron 会按真正的
 * 时间表跑这个逻辑，这里作为前端兜底：万一 cron 那天没跑成功，打开网站的时候还能补上。
 * 返回本次实际生成的交易条数。
 */
export async function generateDueRecurringTransactions(client) {
  const bills = await listRecurringBills(client);
  const todayStr = todayDateStr();
  let count = 0;
  for (const bill of bills.filter((b) => b.active)) {
    let dueDate = bill.next_due_date;
    while (dueDate <= todayStr) {
      await createTransaction(client, {
        date: dueDate,
        type: bill.type,
        amount: bill.amount,
        category_id: bill.category_id,
        account_id: bill.account_id,
        description: bill.name,
        source: 'recurring',
      });
      count += 1;
      dueDate = computeNextDueDate(dueDate, bill);
    }
    if (dueDate !== bill.next_due_date) {
      await updateRecurringBill(client, bill.id, { next_due_date: dueDate });
    }
  }
  return count;
}
