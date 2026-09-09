import { useState } from 'react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { createAccount, deleteAccount, adjustAccountBalance, createTransfer } from '../lib/api.js';
import { fmt, todayStr } from '../lib/format.js';
import AccountSelect from '../components/AccountSelect.jsx';

export default function AccountsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { accounts, refreshAccounts } = useData();

  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [initialBalance, setInitialBalance] = useState('0');
  const [color, setColor] = useState('#3d5a80');

  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(todayStr());
  const [transferDescription, setTransferDescription] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createAccount(client, { name: trimmed, type, initial_balance: parseFloat(initialBalance) || 0, color });
      setName('');
      setType('bank');
      setInitialBalance('0');
      showToast('已添加账户');
      refreshAccounts();
    } catch (e) {
      showToast('添加失败：' + (e.message?.includes('duplicate') ? '账户名已存在' : e.message), true);
    }
  }

  async function handleAdjust(a) {
    const input = window.prompt(`把「${a.name}」的余额调整为多少？（会自动补一笔差额的收入/支出记录）`, a.balance.toFixed(2));
    if (input === null) return;
    const target = parseFloat(input);
    if (Number.isNaN(target)) {
      showToast('请输入有效的数字', true);
      return;
    }
    try {
      const result = await adjustAccountBalance(client, a.id, a.balance, target);
      showToast(result ? '已调整余额' : '余额没有变化');
      refreshAccounts();
    } catch (e) {
      showToast('调整失败：' + e.message, true);
    }
  }

  async function handleTransfer(e) {
    e.preventDefault();
    if (!fromAccountId || !toAccountId) return;
    if (fromAccountId === toAccountId) {
      showToast('转出和转入不能是同一个账户', true);
      return;
    }
    const fromAccount = accounts.find((a) => String(a.id) === fromAccountId);
    const toAccount = accounts.find((a) => String(a.id) === toAccountId);
    try {
      await createTransfer(client, {
        date: transferDate,
        fromAccountId,
        fromAccountName: fromAccount?.name || '',
        toAccountId,
        toAccountName: toAccount?.name || '',
        amount: parseFloat(transferAmount),
        description: transferDescription.trim(),
      });
      setFromAccountId('');
      setToAccountId('');
      setTransferAmount('');
      setTransferDate(todayStr());
      setTransferDescription('');
      showToast('转账成功');
      refreshAccounts();
    } catch (e) {
      showToast('转账失败：' + e.message, true);
    }
  }

  async function handleDelete(a) {
    if (!window.confirm('删除后该账户下的记录会变为不关联任何账户，确认删除？')) return;
    try {
      await deleteAccount(client, a.id);
      showToast('已删除');
      refreshAccounts();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
    }
  }

  return (
    <section>
      <h1>💳 账户</h1>

      <section className="add-form-section">
        <h2>新增账户</h2>
        <p className="hint">信用卡如果当前有欠款，初始余额填负数（比如欠 2000 就填 -2000）。</p>
        <form onSubmit={handleAdd} className="tx-form">
          <div className="tx-form-row">
            <label className="grow">名称
              <input type="text" placeholder="例如：招商银行储蓄卡" required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>类型
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="bank">银行账户</option>
                <option value="credit_card">信用卡</option>
              </select>
            </label>
            <label>初始余额
              <input type="number" step="0.01" required value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
            </label>
            <label>颜色
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <button type="submit" className="btn primary">添加账户</button>
          </div>
        </form>
      </section>

      <ul className="category-list">
        {accounts.length === 0 ? (
          <li className="empty">还没有账户，先在上面添加一个吧</li>
        ) : (
          accounts.map((a) => {
            const balanceClass = a.balance > 0 ? 'positive' : a.balance < 0 ? 'negative' : '';
            return (
              <li key={a.id}>
                <span className="swatch" style={{ background: a.color }}></span>
                <span className="cat-name">{a.name} <span className="tag">{a.type === 'credit_card' ? '信用卡' : '银行账户'}</span></span>
                <span className={`balance ${balanceClass}`}>{fmt(a.balance)}</span>
                <button type="button" className="link-btn" onClick={() => handleAdjust(a)}>调整余额</button>
                <button type="button" className="link-btn danger" onClick={() => handleDelete(a)}>删除</button>
              </li>
            );
          })
        )}
      </ul>

      <section className="add-form-section">
        <h2>转账</h2>
        <p className="hint">在自己的账户之间转移资金（比如还信用卡欠款），不计入收入/支出统计，只会影响账户余额。</p>
        <form onSubmit={handleTransfer} className="tx-form">
          <div className="tx-form-row">
            <label>从
              <AccountSelect accounts={accounts} value={fromAccountId} onChange={setFromAccountId} />
            </label>
            <label>到
              <AccountSelect accounts={accounts} value={toAccountId} onChange={setToAccountId} />
            </label>
            <label>金额
              <input type="number" step="0.01" min="0.01" required value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} />
            </label>
            <label>日期
              <input type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </label>
            <label className="grow">备注
              <input type="text" placeholder="选填" value={transferDescription} onChange={(e) => setTransferDescription(e.target.value)} />
            </label>
            <button type="submit" className="btn primary">转账</button>
          </div>
        </form>
      </section>
    </section>
  );
}
