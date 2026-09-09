import { useState } from 'react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { updateTransaction, deleteTransaction } from '../lib/api.js';
import CategorySelect from './CategorySelect.jsx';
import AccountSelect from './AccountSelect.jsx';

const SOURCE_LABEL = { pdf_import: 'PDF导入', recurring: '定时账单', adjustment: '余额调整', transfer: '转账' };

export default function TransactionRow({ t, categories, accounts, onChanged }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const [date, setDate] = useState(t.date);
  const [type, setType] = useState(t.type);
  const [categoryId, setCategoryId] = useState(t.category_id || '');
  const [accountId, setAccountId] = useState(t.account_id || '');
  const [amount, setAmount] = useState(t.amount);
  const [description, setDescription] = useState(t.description || '');

  async function handleSave() {
    try {
      await updateTransaction(client, t.id, {
        date,
        type,
        amount: parseFloat(amount),
        category_id: categoryId || null,
        account_id: accountId || null,
        description: description.trim(),
      });
      showToast('已保存');
      onChanged();
    } catch (e) {
      showToast('保存失败：' + e.message, true);
    }
  }

  async function handleDelete() {
    const msg = t.source === 'transfer'
      ? '这是一笔转账的其中一侧记录，删除只会删掉这一条，另一侧账户的记录不会自动删除，确认删除？'
      : '确认删除这条记录？';
    if (!window.confirm(msg)) return;
    try {
      await deleteTransaction(client, t.id);
      showToast('已删除');
      onChanged();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
    }
  }

  return (
    <tr>
      <td><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></td>
      <td>
        <select
          className="type-select"
          value={type}
          onChange={(e) => { setType(e.target.value); setCategoryId(''); }}
        >
          <option value="expense">支出</option>
          <option value="income">收入</option>
        </select>
      </td>
      <td><CategorySelect categories={categories} type={type} value={categoryId} onChange={setCategoryId} /></td>
      <td><AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} /></td>
      <td><input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></td>
      <td><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} /></td>
      <td><span className="tag">{SOURCE_LABEL[t.source] || '手动'}</span></td>
      <td className="row-actions"><button type="button" className="link-btn" onClick={handleSave}>保存</button></td>
      <td className="delete-cell"><button type="button" className="link-btn danger" onClick={handleDelete}>删除</button></td>
    </tr>
  );
}
