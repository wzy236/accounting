// 业务接口层：每个函数第一个参数都是 supabase-js client（来自 useSupabase() 的 context），
// 用的是官方 SDK 的查询构造器，权限仍然靠数据库那边的 RLS 策略保证，跟静态站点版本原理一致。

import { HOME_CURRENCY, fetchRatesToHome, toStoredAmount, round2 } from './currency.js';

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

// Supabase（PostgREST）默认一次最多返回 1000 行，超过的部分会被悄悄截掉。
// 可能超过 1000 行的查询都用这个分页取全：buildQuery 每次返回一个新的查询构造器，必须带稳定的排序。
const PAGE_SIZE = 1000;

async function fetchAllPages(buildQuery) {
  const all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = unwrap(await buildQuery().range(from, from + PAGE_SIZE - 1));
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
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

export async function updateCategory(client, id, fields) {
  return unwrap(await client.from('categories').update(fields).eq('id', id).select());
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
  return listTransactionsInRange(client, start, end);
}

/** 查询 [start, end) 区间内的交易，日期都是 YYYY-MM-DD；start/end 都不传就是全部交易。 */
export async function listTransactionsInRange(client, start, end) {
  const rows = await fetchAllPages(() => {
    let q = client.from('transactions').select('*, categories(id,name,color), accounts(id,name)');
    if (start) q = q.gte('date', start);
    if (end) q = q.lt('date', end);
    return q
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id');
  });
  return rows.map((r) => ({
    ...r,
    category_name: r.categories?.name || null,
    category_color: r.categories?.color || null,
    account_name: r.accounts?.name || null,
  }));
}

export async function createTransaction(client, { date, type, amount, category_id, account_id, description, source, currency, original_amount, exchange_rate }) {
  return unwrap(
    await client
      .from('transactions')
      .insert({
        date, type, amount,
        category_id: category_id || null,
        account_id: account_id || null,
        description: description || '',
        source: source || 'manual',
        currency: currency || 'CAD',
        original_amount: original_amount ?? null,
        exchange_rate: exchange_rate ?? null,
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

const UNCATEGORIZED = { id: 'none', name: '未分类', color: '#8d99ae' };

function sumInto(totals, key, info, amount) {
  const entry = totals.get(key) || { ...info, total: 0 };
  entry.total += amount;
  totals.set(key, entry);
}

function sortedTotals(totals) {
  return [...totals.values()].sort((a, b) => b.total - a.total);
}

/**
 * 按顶级分类聚合收入/支出总额（子分类的金额并入它的父分类），供饼图使用。
 * 转账不算真正的收支，排除掉。每一项带 hasChildren，表示这个顶级分类下有子分类、可以点开细看。
 */
export function aggregateByTopCategory(transactions, type, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map();
  for (const t of transactions) {
    if (t.type !== type || t.source === 'transfer') continue;
    const cat = byId.get(t.category_id);
    const top = cat ? (cat.parent_id ? byId.get(cat.parent_id) || cat : cat) : UNCATEGORIZED;
    sumInto(totals, top.id, { id: top.id, name: top.name, color: top.color }, Number(t.amount));
  }
  return sortedTotals(totals).map((e) => ({
    ...e,
    hasChildren: categories.some((c) => c.parent_id === e.id),
  }));
}

/** 某个顶级分类内部按子分类拆开；直接记在顶级分类本身（没选子分类）的单独算一项。 */
export function aggregateSubcategories(transactions, type, parentId, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const parent = byId.get(parentId);
  const totals = new Map();
  for (const t of transactions) {
    if (t.type !== type || t.source === 'transfer') continue;
    const cat = byId.get(t.category_id);
    if (!cat) continue;
    if (cat.id === parentId) {
      sumInto(totals, cat.id, { id: cat.id, name: `${cat.name}（未细分）`, color: cat.color }, Number(t.amount));
    } else if (cat.parent_id === parentId) {
      sumInto(totals, cat.id, { id: cat.id, name: cat.name, color: cat.color }, Number(t.amount));
    }
  }
  return { parent, items: sortedTotals(totals) };
}

/* ================= 账户（银行卡 / 信用卡） ================= */

export async function listAccounts(client) {
  return unwrap(await client.from('accounts').select('*').order('type').order('name'));
}

export async function createAccount(client, { name, type, initial_balance, color, currency }) {
  const row = { name, type, initial_balance: initial_balance || 0, color };
  // 只有非 CAD 才写 currency 列，这样没跑新 schema 的数据库也还能正常建 CAD 账户
  if (currency && currency !== HOME_CURRENCY) row.currency = currency;
  return unwrap(await client.from('accounts').insert(row).select());
}

export async function updateAccount(client, id, fields) {
  return unwrap(await client.from('accounts').update(fields).eq('id', id).select());
}

export async function deleteAccount(client, id) {
  // 被 RLS 挡住时 Supabase 不会报错，只是删了 0 行；要求返回被删的行，才能发现“其实没删掉”
  const deleted = unwrap(await client.from('accounts').delete().eq('id', id).select('id'));
  if (!deleted || deleted.length === 0) {
    throw new Error('数据库没有删除这个账户（删了 0 行），可能是缺少删除权限，请在 Supabase 重新执行 sql/schema.sql');
  }
  return deleted;
}

/**
 * 每个账户的当前余额（用账户自己的币种）= 初始余额 + 关联记录的收入 - 支出。
 * 记录里 amount 永远是 CAD：外币账户优先用记录自己的原币金额（币种一致时），
 * 对不上的（比如以前按 CAD 记进去的）按当前汇率折算。
 * 另外附带 balance_cad（按当前汇率折成 CAD，用来算总资产），汇率查不到时为 null。
 */
export async function getAccountBalances(client) {
  const accounts = (await listAccounts(client)).map((a) => ({ ...a, currency: a.currency || HOME_CURRENCY }));
  if (accounts.length === 0) return [];
  const [txs, rates] = await Promise.all([
    fetchAllPages(() =>
      client.from('transactions').select('account_id,type,amount,currency,original_amount').not('account_id', 'is', null).order('id')
    ),
    fetchRatesToHome(accounts.map((a) => a.currency)),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const deltas = new Map();
  for (const t of txs) {
    const acc = byId.get(t.account_id);
    if (!acc) continue;
    let value = Number(t.amount);
    if (acc.currency !== HOME_CURRENCY) {
      if (t.currency === acc.currency && t.original_amount != null) value = Number(t.original_amount);
      else if (rates[acc.currency]) value = Number(t.amount) / rates[acc.currency];
    }
    const delta = t.type === 'income' ? value : -value;
    deltas.set(t.account_id, (deltas.get(t.account_id) || 0) + delta);
  }
  return accounts.map((a) => {
    const balance = Number(a.initial_balance) + (deltas.get(a.id) || 0);
    const rate = rates[a.currency];
    return { ...a, balance, balance_cad: rate ? balance * rate : null };
  });
}

/** 外币字段只在非 CAD 时带上，CAD 记录保持和以前一样。 */
function foreignFields(stored) {
  return stored.currency === HOME_CURRENCY
    ? { amount: stored.amount }
    : stored;
}

/**
 * 把账户余额调整到 targetBalance（账户自己的币种）：按差额补一笔收入/支出交易（source: 'adjustment'），
 * 而不是直接改数字，这样余额的每次变动都在记账记录里留痕。差额为 0 时什么都不做。
 */
export async function adjustAccountBalance(client, account, targetBalance) {
  const delta = round2(Number(targetBalance) - Number(account.balance));
  if (delta === 0) return null;
  const stored = await toStoredAmount(Math.abs(delta), account.currency);
  return createTransaction(client, {
    date: todayDateStr(),
    type: delta > 0 ? 'income' : 'expense',
    account_id: account.id,
    description: '余额调整',
    source: 'adjustment',
    ...stored,
  });
}

/**
 * 账户间转账：记一对交易（源账户支出 + 目标账户收入），source 都标成 'transfer'。
 * 两条记录用一次批量插入发出去，数据库那边是同一条 INSERT 语句，不会出现只写成功一半的情况。
 * 转账不算真正的收入/支出，月度统计和饼图里会把 source: 'transfer' 的记录排除掉。
 * fromAmount / toAmount 分别是两个账户各自币种的金额（同币种时相等）。
 */
export async function createTransfer(client, { date, from, to, fromAmount, toAmount, description }) {
  const note = description ? `：${description}` : '';
  const [out, inn] = await Promise.all([
    toStoredAmount(fromAmount, from.currency),
    toStoredAmount(toAmount ?? fromAmount, to.currency),
  ]);
  return createTransactionsBulk(client, [
    {
      date, type: 'expense',
      ...foreignFields(out),
      account_id: from.id,
      category_id: null,
      description: `转账到「${to.name}」${note}`,
      source: 'transfer',
    },
    {
      date, type: 'income',
      ...foreignFields(inn),
      account_id: to.id,
      category_id: null,
      description: `转账自「${from.name}」${note}`,
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

/** 定时账单表单 → 数据库字段；按频率把用不到的 day_of_week / day_of_month 清成 null。 */
function billRow({ name, type, amount, category_id, account_id, frequency, day_of_week, day_of_month, next_due_date }) {
  return {
    name, type, amount,
    category_id: category_id || null,
    account_id: account_id || null,
    frequency,
    day_of_week: frequency === 'weekly' || frequency === 'biweekly' ? day_of_week : null,
    day_of_month: frequency === 'monthly' ? day_of_month : null,
    next_due_date,
  };
}

export async function createRecurringBill(client, bill) {
  return unwrap(await client.from('recurring_bills').insert({ ...billRow(bill), active: true }).select());
}

/** 编辑定时账单的全部内容（不改启用状态）。 */
export async function editRecurringBill(client, id, bill) {
  return unwrap(await client.from('recurring_bills').update(billRow(bill)).eq('id', id).select());
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
  if (bill.frequency === 'biweekly') return addDays(fromDateStr, 14);
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
