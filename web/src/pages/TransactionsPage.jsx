import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { listTransactionsForMonth, createTransaction } from '../lib/api.js';
import { defaultMonth, todayStr, fmt } from '../lib/format.js';
import { CURRENCIES, HOME_CURRENCY, fetchRate } from '../lib/currency.js';
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

  const [currency, setCurrency] = useState(HOME_CURRENCY);
  const [rate, setRate] = useState(1);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');

  const loadRate = useCallback(async (cur) => {
    if (cur === HOME_CURRENCY) {
      setRate(1);
      setRateError('');
      return;
    }
    setRateLoading(true);
    setRateError('');
    try {
      const r = await fetchRate(cur, HOME_CURRENCY);
      setRate(r);
    } catch (e) {
      setRate(null);
      setRateError(e.message);
    } finally {
      setRateLoading(false);
    }
  }, []);

  function handleCurrencyChange(cur) {
    setCurrency(cur);
    loadRate(cur);
  }

  const convertedAmount = currency !== HOME_CURRENCY && rate && amount
    ? (parseFloat(amount) * rate)
    : null;

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

    let cadAmount = parseFloat(amount);
    let usedRate = null;
    if (currency !== HOME_CURRENCY) {
      let r = rate;
      if (!r) {
        // 汇率还没取到（比如上次查询失败），提交前再试一次，还是失败就不让提交
        try {
          r = await fetchRate(currency, HOME_CURRENCY);
          setRate(r);
        } catch (e2) {
          showToast('汇率还没获取到，无法换算成 CAD：' + e2.message, true);
          return;
        }
      }
      usedRate = r;
      cadAmount = Math.round(parseFloat(amount) * r * 100) / 100;
    }

    try {
      await createTransaction(client, {
        date,
        type,
        amount: cadAmount,
        category_id: categoryId || null,
        account_id: accountId || null,
        description: description.trim(),
        currency,
        original_amount: currency !== HOME_CURRENCY ? parseFloat(amount) : null,
        exchange_rate: usedRate,
      });
      setDate(todayStr());
      setCategoryId('');
      setAccountId('');
      setAmount('');
      setDescription('');
      setCurrency(HOME_CURRENCY);
      setRate(1);
      setRateError('');
      showToast('已添加');
      reload();
    } catch (e) {
      showToast('添加失败：' + e.message, true);
    }
  }

  // 转账不算真正的收入/支出，只是钱在自己账户之间挪动，排除掉才不会让统计数字失真
  const income = transactions.filter((t) => t.type === 'income' && t.source !== 'transfer').reduce((s, t) => s + Number(t.amount), 0);
  const expense = transactions.filter((t) => t.type === 'expense' && t.source !== 'transfer').reduce((s, t) => s + Number(t.amount), 0);

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
            <label>币种
              <select value={currency} onChange={(e) => handleCurrencyChange(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="grow">备注
              <input type="text" placeholder="选填" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <button type="submit" className="btn primary">添加</button>
          </div>
          {currency !== HOME_CURRENCY && (
            <p className="hint fx-hint">
              {rateLoading && '正在查询实时汇率…'}
              {!rateLoading && rateError && (
                <>
                  {rateError}
                  <button type="button" className="link-btn" onClick={() => loadRate(currency)}>重试</button>
                </>
              )}
              {!rateLoading && !rateError && rate && (
                <>
                  汇率 1 {currency} = {rate.toFixed(4)} CAD
                  {convertedAmount != null && <> ，约合 {fmt(convertedAmount)}</>}
                </>
              )}
            </p>
          )}
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
