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
    `/transactions?select=*,categories(id,name,color)&date=gte.${start}&date=lt.${end}&order=date.desc,created_at.desc`
  );
  return rows.map((r) => ({
    ...r,
    category_name: r.categories?.name || null,
    category_color: r.categories?.color || null,
  }));
}

export async function createTransaction({ date, type, amount, category_id, description, source }) {
  return restRequest('/transactions', {
    method: 'POST',
    body: { date, type, amount, category_id: category_id || null, description: description || '', source: source || 'manual' },
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
