import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { listTransactionsForMonth, createTransaction } from '../lib/api.js';
import { defaultMonth, todayStr, fmt } from '../lib/format.js';
import CategorySelect from '../components/CategorySelect.jsx';
import AccountSelect from '../components/AccountSelect.jsx';
import TransactionRow from '../components/TransactionRow.jsx';

export default function TransactionsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, accounts, ready } = useData();

  const [month, setMonth] = useState(defaultMonth());
  const [transactions, setTransactions] = useState([]);

  const [date, setDate] = useState(todayStr());
  const [type, setType] = useState('expense');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const reload = useCallback(async () => {
    try {
      const rows = await listTransactionsForMonth(client, month);
      setTransactions(rows);
    } catch (e) {
      showToast('加载记录失败：' + e.message, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, month]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  async function handleAdd(e) {
    e.preventDefault();
    try {
      await createTransaction(client, {
        date,
        type,
        amount: parseFloat(amount),
        category_id: categoryId || null,
        account_id: accountId || null,
        description: description.trim(),
      });
      setDate(todayStr());
      setCategoryId('');
      setAccountId('');
      setAmount('');
      setDescription('');
      showToast('已添加');
      reload();
    } catch (e) {
      showToast('添加失败：' + e.message, true);
    }
  }

  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <section>
      <div className="page-header">
        <h1>📝 记账</h1>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <div className="summary-cards">
        <div className="card income">
          <span className="label">本月收入</span>
          <span className="value">{fmt(income)}</span>
        </div>
        <div className="card expense">
          <span className="label">本月支出</span>
          <span className="value">{fmt(expense)}</span>
        </div>
        <div className="card balance">
          <span className="label">本月结余</span>
          <span className="value">{fmt(income - expense)}</span>
        </div>
      </div>

      <section className="add-form-section">
        <h2>新增一笔</h2>
        <form onSubmit={handleAdd} className="tx-form">
          <div className="tx-form-row">
            <label>日期
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>类型
              <select className="type-select" value={type} onChange={(e) => { setType(e.target.value); setCategoryId(''); }}>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </label>
            <label>分类
              <CategorySelect categories={categories} type={type} value={categoryId} onChange={setCategoryId} />
            </label>
            <label>账户
              <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
            </label>
            <label>金额
              <input type="number" step="0.01" min="0.01" placeholder="0.00" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="grow">备注
              <input type="text" placeholder="选填" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <button type="submit" className="btn primary">添加</button>
          </div>
        </form>
      </section>

      <section>
        <h2>本月明细</h2>
        <div className="table-scroll">
          <table className="tx-table">
            <thead>
              <tr><th>日期</th><th>类型</th><th>分类</th><th>账户</th><th>金额</th><th>备注</th><th>来源</th><th></th><th></th></tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={9} className="empty">本月还没有记录</td></tr>
              ) : (
                transactions.map((t) => (
                  <TransactionRow key={t.id} t={t} categories={categories} accounts={accounts} onChanged={reload} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
