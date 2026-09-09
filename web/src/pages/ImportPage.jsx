import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { createTransactionsBulk } from '../lib/api.js';
import { extractTextFromPdf } from '../lib/pdfExtract.js';
import { parseStatementText } from '../lib/bankStatementParser.js';
import { extractCandidatesFromCsv, extractCandidatesFromExcel } from '../lib/spreadsheetImport.js';
import CategorySelect from '../components/CategorySelect.jsx';
import AccountSelect from '../components/AccountSelect.jsx';

/** 按文件后缀分发到对应的解析器，统一返回候选交易记录数组。 */
async function extractCandidatesFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    return extractCandidatesFromCsv(await file.text());
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return extractCandidatesFromExcel(await file.arrayBuffer());
  }
  return parseStatementText(await extractTextFromPdf(await file.arrayBuffer()));
}

export default function ImportPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, accounts } = useData();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState(null); // null = 还没上传；否则是候选记录数组

  function resetImport() {
    setRows(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    setError('');
    if (!file) return;
    setParsing(true);
    try {
      const candidates = await extractCandidatesFromFile(file);
      if (candidates.length === 0) {
        setError('未能从该文件中识别出任何交易记录，可能格式不受支持，请检查文件或尝试其他对账单。');
        return;
      }
      setRows(candidates.map((c) => ({ ...c, include: true, category_id: '', account_id: '' })));
    } catch (err) {
      setError('解析文件失败：' + err.message);
    } finally {
      setParsing(false);
    }
  }

  function updateRow(index, fields) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...fields } : r)));
  }

  async function handleConfirm() {
    const selected = rows
      .filter((r) => r.include)
      .map((r) => ({
        date: r.date,
        type: r.type,
        amount: parseFloat(r.amount),
        category_id: r.category_id || null,
        account_id: r.account_id || null,
        description: r.description.trim(),
        source: 'pdf_import',
      }))
      .filter((r) => r.date && r.amount > 0);

    if (selected.length === 0) {
      showToast('没有勾选任何记录', true);
      return;
    }

    try {
      await createTransactionsBulk(client, selected);
      resetImport();
      showToast(`成功导入 ${selected.length} 条记录`);
      navigate('/transactions');
    } catch (e) {
      setError('导入失败：' + e.message);
    }
  }

  return (
    <section>
      <h1>📥 导入对账单</h1>
      {error && <p className="error">{error}</p>}

      {!rows ? (
        <section className="add-form-section">
          <p className="hint">
            支持上传银行/信用卡对账单的 PDF、Excel（.xlsx/.xls）或 CSV 文件，系统会在你的浏览器本地解析每一行的日期、描述和金额（不会上传到任何服务器）。
            解析基于常见格式的启发式规则，<strong>并非 100% 准确</strong>，导入前你可以在预览表格里逐条核对、修改或取消勾选。
          </p>
          <label>选择对账单文件（PDF / Excel / CSV）
            <input ref={fileInputRef} type="file" accept="application/pdf,.csv,text/csv,.xlsx,.xls" onChange={handleFileChange} />
          </label>
          {parsing && <p className="hint">正在解析文件…</p>}
        </section>
      ) : (
        <section>
          <p className="hint">识别到 {rows.length} 条候选记录，请核对后确认导入。取消勾选可跳过某条记录。</p>
          <div className="table-scroll">
            <table className="tx-table">
              <thead>
                <tr><th>导入</th><th>日期</th><th>类型</th><th>分类</th><th>账户</th><th>金额</th><th>描述</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><input type="checkbox" checked={r.include} onChange={(e) => updateRow(i, { include: e.target.checked })} /></td>
                    <td><input type="date" value={r.date} onChange={(e) => updateRow(i, { date: e.target.value })} /></td>
                    <td>
                      <select className="type-select" value={r.type} onChange={(e) => updateRow(i, { type: e.target.value, category_id: '' })}>
                        <option value="expense">支出</option>
                        <option value="income">收入</option>
                      </select>
                    </td>
                    <td><CategorySelect categories={categories} type={r.type} value={r.category_id} onChange={(v) => updateRow(i, { category_id: v })} /></td>
                    <td><AccountSelect accounts={accounts} value={r.account_id} onChange={(v) => updateRow(i, { account_id: v })} /></td>
                    <td><input type="number" step="0.01" min="0.01" value={r.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} /></td>
                    <td><input type="text" value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="btn primary" onClick={handleConfirm}>确认导入</button>
            <button type="button" className="link-btn" onClick={resetImport}>取消，重新上传</button>
          </div>
        </section>
      )}
    </section>
  );
}
