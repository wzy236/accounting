import { useState } from 'react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { createAccount, deleteAccount, adjustAccountBalance, createTransfer } from '../lib/api.js';
import { fmt, todayStr, balanceClass } from '../lib/format.js';
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

  // 余额为正算资产，为负（主要是信用卡欠款）算负债
  const assets = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const liabilities = accounts.filter((a) => a.balance < 0).reduce((s, a) => s - a.balance, 0);

  return (
    <section>
      <h1>💳 账户</h1>

      {accounts.length > 0 && (
        <div className="summary-cards">
          <div className="card income">
            <span className="label">总资产</span>
            <span className="value">{fmt(assets)}</span>
          </div>
          <div className="card expense">
            <span className="label">总负债</span>
            <span className="value">{fmt(liabilities)}</span>
          </div>
          <div className="card balance">
            <span className="label">净资产</span>
            <span className="value">{fmt(assets - liabilities)}</span>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="empty-card">还没有账户，先在下面添加一个吧</p>
      ) : (
        <div className="account-grid">
          {accounts.map((a) => (
            <div key={a.id} className="account-card" style={{ '--account-color': a.color }}>
              <div className="account-card-head">
                <span className="account-name">{a.name}</span>
                <span className="tag">{a.type === 'credit_card' ? '信用卡' : '银行账户'}</span>
              </div>
              <div className={`balance account-balance ${balanceClass(a.balance)}`}>{fmt(a.balance)}</div>
              <div className="account-actions">
                <button type="button" className="link-btn" onClick={() => handleAdjust(a)}>调整余额</button>
                <button type="button" className="link-btn danger" onClick={() => handleDelete(a)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

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
    </section>
  );
}
