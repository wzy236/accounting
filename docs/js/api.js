import { restRequest } from './supabaseClient.js';

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

export async function listCategories() {
  return restRequest('/categories?select=*&order=type.asc,name.asc');
}

/** 新用户首次登录时，如果还没有任何分类，写入一套默认分类。 */
export async function ensureDefaultCategories() {
  const existing = await listCategories();
  if (existing.length > 0) return existing;
  await restRequest('/categories', {
    method: 'POST',
    body: DEFAULT_CATEGORIES,
    prefer: 'return=representation',
  });
  return listCategories();
}

export async function createCategory({ name, type, color }) {
  return restRequest('/categories', {
    method: 'POST',
    body: { name, type, color },
    prefer: 'return=representation',
  });
}

export async function deleteCategory(id) {
  return restRequest(`/categories?id=eq.${id}`, { method: 'DELETE' });
}

function monthRange(monthStr) {
  const start = `${monthStr}-01`;
  const [y, m] = monthStr.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start, end: `${nextMonth}-01` };
}

export async function listTransactionsForMonth(monthStr) {
  const { start, end } = monthRange(monthStr);
  const rows = await restRequest(
    `/transactions?select=*,categories(id,name,color),accounts(id,name)&date=gte.${start}&date=lt.${end}&order=date.desc,created_at.desc`
  );
  return rows.map((r) => ({
    ...r,
    category_name: r.categories?.name || null,
    category_color: r.categories?.color || null,
    account_name: r.accounts?.name || null,
  }));
}

export async function createTransaction({ date, type, amount, category_id, account_id, description, source }) {
  return restRequest('/transactions', {
    method: 'POST',
    body: {
      date, type, amount,
      category_id: category_id || null,
      account_id: account_id || null,
      description: description || '',
      source: source || 'manual',
    },
    prefer: 'return=representation',
  });
}

export async function updateTransaction(id, fields) {
  return restRequest(`/transactions?id=eq.${id}`, {
    method: 'PATCH',
    body: fields,
    prefer: 'return=representation',
  });
}

export async function deleteTransaction(id) {
  return restRequest(`/transactions?id=eq.${id}`, { method: 'DELETE' });
}

export async function createTransactionsBulk(rows) {
  return restRequest('/transactions', {
    method: 'POST',
    body: rows,
    prefer: 'return=representation',
  });
}

/* ================= 账户（银行卡 / 信用卡） ================= */

export async function listAccounts() {
  return restRequest('/accounts?select=*&order=type.asc,name.asc');
}

export async function createAccount({ name, type, initial_balance, color }) {
  return restRequest('/accounts', {
    method: 'POST',
    body: { name, type, initial_balance: initial_balance || 0, color },
    prefer: 'return=representation',
  });
}

export async function updateAccount(id, fields) {
  return restRequest(`/accounts?id=eq.${id}`, {
    method: 'PATCH',
    body: fields,
    prefer: 'return=representation',
  });
}

export async function deleteAccount(id) {
  return restRequest(`/accounts?id=eq.${id}`, { method: 'DELETE' });
}

/** 每个账户的当前余额 = 初始余额 + 关联到该账户的收入 - 支出。 */
export async function getAccountBalances() {
  const accounts = await listAccounts();
  if (accounts.length === 0) return [];
  const txs = await restRequest('/transactions?select=account_id,type,amount&account_id=not.is.null');
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

/* ================= 定时账单 ================= */

export async function listRecurringBills() {
  return restRequest('/recurring_bills?select=*,categories(id,name,color),accounts(id,name)&order=next_due_date.asc');
}

export async function createRecurringBill({ name, type, amount, category_id, account_id, frequency, day_of_week, day_of_month, next_due_date }) {
  return restRequest('/recurring_bills', {
    method: 'POST',
    body: {
      name, type, amount,
      category_id: category_id || null,
      account_id: account_id || null,
      frequency,
      day_of_week: frequency === 'weekly' ? day_of_week : null,
      day_of_month: frequency === 'monthly' ? day_of_month : null,
      next_due_date,
      active: true,
    },
    prefer: 'return=representation',
  });
}

export async function updateRecurringBill(id, fields) {
  return restRequest(`/recurring_bills?id=eq.${id}`, {
    method: 'PATCH',
    body: fields,
    prefer: 'return=representation',
  });
}

export async function deleteRecurringBill(id) {
  return restRequest(`/recurring_bills?id=eq.${id}`, { method: 'DELETE' });
}

function lastDayOfMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** 根据账单的频率算出下一次到期日期；monthly 超过当月天数时自动取当月最后一天（比如 31 号在 2 月就是 28/29 号）。 */
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
 * 补生成所有已到期但还没生成交易记录的定时账单（纯静态网站没有服务器定时任务，
 * 靠用户打开网站时“补课”触发，不精确到具体时间点，但不会漏）。
 * 返回本次实际生成的交易条数。
 */
export async function generateDueRecurringTransactions() {
  const bills = await listRecurringBills();
  const todayStr = todayDateStr();
  let count = 0;
  for (const bill of bills.filter((b) => b.active)) {
    let dueDate = bill.next_due_date;
    while (dueDate <= todayStr) {
      await createTransaction({
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
      await updateRecurringBill(bill.id, { next_due_date: dueDate });
    }
  }
  return count;
}

/** 按分类聚合某月的收入/支出总额，供饼图使用（客户端聚合，数据量不大够用）。 */
export function aggregateByCategory(transactions, type) {
  const totals = new Map();
  for (const t of transactions) {
    if (t.type !== type) continue;
    const key = t.category_id || 'none';
    const name = t.category_name || '未分类';
    const color = t.category_color || '#8d99ae';
    const entry = totals.get(key) || { name, color, total: 0 };
    entry.total += Number(t.amount);
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total);
}

export { monthRange };
