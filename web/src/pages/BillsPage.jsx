import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { listRecurringBills, createRecurringBill, updateRecurringBill, deleteRecurringBill } from '../lib/api.js';
import { todayStr, fmt } from '../lib/format.js';
import CategorySelect from '../components/CategorySelect.jsx';
import AccountSelect from '../components/AccountSelect.jsx';

const WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

function formatFrequency(bill) {
  if (bill.frequency === 'daily') return '每天';
  if (bill.frequency === 'weekly') return '每周' + WEEKDAY_LABEL[bill.day_of_week];
  return `每月 ${bill.day_of_month} 号`;
}

export default function BillsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, accounts, ready } = useData();

  const [bills, setBills] = useState([]);

  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [nextDueDate, setNextDueDate] = useState(todayStr());

  const reload = useCallback(async () => {
    try {
      setBills(await listRecurringBills(client));
    } catch (e) {
      showToast('加载定时账单失败：' + e.message, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createRecurringBill(client, {
        name: trimmed,
        type,
        amount: parseFloat(amount),
        category_id: categoryId || null,
        account_id: accountId || null,
        frequency,
        day_of_week: parseInt(dayOfWeek, 10),
        day_of_month: parseInt(dayOfMonth, 10),
        next_due_date: nextDueDate,
      });
      setName('');
      setAmount('');
      setCategoryId('');
      setAccountId('');
      setFrequency('monthly');
      setDayOfMonth('1');
      setNextDueDate(todayStr());
      showToast('已添加定时账单');
      reload();
    } catch (e) {
      showToast('添加失败：' + e.message, true);
    }
  }

  async function handleToggleActive(bill, active) {
    try {
      await updateRecurringBill(client, bill.id, { active });
      reload();
    } catch (e) {
      showToast('更新失败：' + e.message, true);
    }
  }

  async function handleDelete(bill) {
    if (!window.confirm('确认删除这个定时账单？已经生成的记账记录不会被删除。')) return;
    try {
      await deleteRecurringBill(client, bill.id);
      showToast('已删除');
      reload();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
    }
  }

  return (
    <section>
      <h1>⏰ 定时账单</h1>
      <p className="hint">
        到期后打开网站会自动补记一笔交易并计入账户余额；后端也有真正的定时任务会按时生成，
        这里的"打开网站补课"只是兜底，万一后端那天没跑成功也不会漏算。
      </p>

      <section className="add-form-section">
        <h2>新增定时账单</h2>
        <form onSubmit={handleAdd} className="tx-form">
          <div className="tx-form-row">
            <label className="grow">名称
              <input type="text" placeholder="例如：信用卡还款" required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>类型
              <select className="type-select" value={type} onChange={(e) => { setType(e.target.value); setCategoryId(''); }}>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </label>
            <label>金额
              <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>分类
              <CategorySelect categories={categories} type={type} value={categoryId} onChange={setCategoryId} />
            </label>
            <label>账户
              <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
            </label>
          </div>
          <div className="tx-form-row">
            <label>重复频率
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="monthly">每月</option>
                <option value="weekly">每周</option>
                <option value="daily">每天</option>
              </select>
            </label>
            {frequency === 'monthly' && (
              <label>每月第几天
                <input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
              </label>
            )}
            {frequency === 'weekly' && (
              <label>星期几
                <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                  <option value="1">周一</option>
                  <option value="2">周二</option>
                  <option value="3">周三</option>
                  <option value="4">周四</option>
                  <option value="5">周五</option>
                  <option value="6">周六</option>
                  <option value="0">周日</option>
                </select>
              </label>
            )}
            <label>首次到期日
              <input type="date" required value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
            </label>
            <button type="submit" className="btn primary">添加</button>
          </div>
        </form>
      </section>

      <ul className="category-list">
        {bills.length === 0 ? (
          <li className="empty">还没有定时账单</li>
        ) : (
          bills.map((b) => (
            <li key={b.id}>
              <span className="cat-name">
                {b.name}
                <span className="tag">{b.type === 'expense' ? '支出' : '收入'} · {fmt(b.amount)} · {formatFrequency(b)}</span>
              </span>
              <span className="muted">下次：{b.next_due_date}</span>
              <label><input type="checkbox" checked={b.active} onChange={(e) => handleToggleActive(b, e.target.checked)} /> 启用</label>
              <button type="button" className="link-btn danger" onClick={() => handleDelete(b)}>删除</button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
