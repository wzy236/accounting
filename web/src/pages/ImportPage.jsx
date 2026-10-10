import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, Checkbox, Code, FileInput, Group, Loader, NumberInput, SegmentedControl, SimpleGrid, Stack, Text, TextInput,
} from '@mantine/core';
import { IconDownload, IconFileImport, IconInfoCircle } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { createTransactionsBulk } from '../lib/api.js';
import { HOME_CURRENCY, fetchRatesToHome, round2 } from '../lib/currency.js';
import { extractTextFromPdf } from '../lib/pdfExtract.js';
import { parseStatementText } from '../lib/bankStatementParser.js';
import { extractCandidatesFromCsv, extractCandidatesFromExcel } from '../lib/spreadsheetImport.js';
import PageHeader from '../components/PageHeader.jsx';
import CategorySelect from '../components/CategorySelect.jsx';
import AccountSelect from '../components/AccountSelect.jsx';

const EXAMPLE_CSV = `日期,描述,金额
2026-10-01,工资入账,12000.00
2026-10-02,超市购物,-358.60
2026-10-03,星巴克,-42.00
2026-10-05,信用卡还款,-1200.00
2026-10-08,地铁充值,-100.00
2026-10-10,退款,(66.50)
2026-10-12,朋友转账,500.00
`;

function downloadExampleCsv() {
  const blob = new Blob([EXAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '对账单导入示例.csv';
  a.click();
  URL.revokeObjectURL(url);
}

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

function CandidateCard({ r, onChange, categories, accounts }) {
  const ccy = accounts.find((a) => String(a.id) === String(r.account_id))?.currency || HOME_CURRENCY;
  return (
    <div className="card" style={{ opacity: r.include ? 1 : 0.55 }}>
      <Stack gap="xs" p="sm">
        <Group gap="xs" wrap="nowrap">
          <Checkbox checked={r.include} onChange={(e) => onChange({ include: e.currentTarget.checked })} aria-label="导入这条" />
          <TextInput type="date" size="xs" value={r.date} onChange={(e) => onChange({ date: e.target.value })} style={{ flex: 1 }} />
          <SegmentedControl
            size="xs"
            data={[{ label: '支出', value: 'expense' }, { label: '收入', value: 'income' }]}
            value={r.type}
            color={r.type === 'income' ? 'blue' : 'coral'}
            onChange={(v) => onChange({ type: v, category_id: '' })}
          />
        </Group>
        <Group gap="xs" wrap="nowrap">
          <TextInput size="xs" placeholder="描述" value={r.description} onChange={(e) => onChange({ description: e.target.value })} style={{ flex: 1 }} />
          <NumberInput
            size="xs"
            w={110}
            value={r.amount}
            onChange={(v) => onChange({ amount: v })}
            decimalScale={2}
            min={0}
            allowNegative={false}
            hideControls
            inputMode="decimal"
            rightSection={ccy !== HOME_CURRENCY ? <Text size="10px" c="dimmed">{ccy}</Text> : null}
            aria-label="金额"
          />
        </Group>
        <SimpleGrid cols={2} spacing="xs">
          <CategorySelect size="xs" categories={categories} type={r.type} value={r.category_id} onChange={(v) => onChange({ category_id: v })} />
          <AccountSelect size="xs" accounts={accounts} value={r.account_id} onChange={(v) => onChange({ account_id: v })} />
        </SimpleGrid>
      </Stack>
    </div>
  );
}

export default function ImportPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, accounts, refreshAccounts } = useData();
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState(null); // null = 还没上传；否则是候选记录数组

  function resetImport() {
    setRows(null);
    setError('');
    setFile(null);
  }

  async function handleFileChange(f) {
    setFile(f);
    setError('');
    if (!f) return;
    setParsing(true);
    try {
      const candidates = await extractCandidatesFromFile(f);
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

  const selectedCount = rows ? rows.filter((r) => r.include).length : 0;

  async function handleConfirm() {
    const selected = rows
      .filter((r) => r.include)
      .map((r) => ({
        date: r.date,
        type: r.type,
        amount: Number(r.amount),
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

    setSaving(true);
    try {
      // 导入到外币账户的记录，对账单上的金额就是这个账户的币种，换算成 CAD 再存
      const ccyOf = (id) => accounts.find((a) => String(a.id) === String(id))?.currency || HOME_CURRENCY;
      const rates = await fetchRatesToHome(selected.map((r) => ccyOf(r.account_id)));
      const toInsert = selected.map((r) => {
        const ccy = ccyOf(r.account_id);
        if (ccy === HOME_CURRENCY) return r;
        const rate = rates[ccy];
        if (!rate) throw new Error(`查不到 ${ccy} 的实时汇率，请稍后再试`);
        return { ...r, amount: round2(r.amount * rate), currency: ccy, original_amount: r.amount, exchange_rate: rate };
      });
      await createTransactionsBulk(client, toInsert);
      showToast(`成功导入 ${selected.length} 条记录`);
      refreshAccounts();
      resetImport();
      navigate('/transactions');
    } catch (e) {
      setError('导入失败：' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="导入对账单" back="/more" />
      <div className="page-body">
        <Stack gap="sm">
          {error && <Alert color="red" icon={<IconInfoCircle size={18} />}>{error}</Alert>}

          {!rows ? (
            <>
              <div className="card">
                <Stack gap="md" p="md">
                  <Text size="sm" c="dimmed">
                    支持银行/信用卡对账单的 PDF、Excel（.xlsx/.xls）或 CSV 文件，在你的浏览器本地解析每一行的日期、描述和金额，不会上传到任何服务器。
                    解析基于常见格式的规则，<b>并非 100% 准确</b>，导入前可以逐条核对、修改或取消勾选。
                  </Text>
                  <FileInput
                    label="选择对账单文件"
                    placeholder="点击选择 PDF / Excel / CSV"
                    accept="application/pdf,.csv,text/csv,.xlsx,.xls"
                    leftSection={<IconFileImport size={18} />}
                    value={file}
                    onChange={handleFileChange}
                    clearable
                  />
                  {parsing && <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">正在解析文件…</Text></Group>}
                </Stack>
              </div>

              <div className="card">
                <Stack gap="sm" p="md">
                  <Text fw={600} size="sm">格式示例</Text>
                  <Text size="sm" c="dimmed">
                    CSV / Excel 每一行只要能同时识别出<b>日期</b>和<b>两位小数的金额</b>就行，列的顺序、列数、要不要表头都无所谓。负数或括号表示支出。
                  </Text>
                  <Code block className="example-csv">{EXAMPLE_CSV}</Code>
                  <Group>
                    <Button variant="light" size="xs" leftSection={<IconDownload size={14} />} onClick={downloadExampleCsv}>下载示例 CSV</Button>
                  </Group>
                </Stack>
              </div>
            </>
          ) : (
            <>
              <Text size="sm" c="dimmed">识别到 {rows.length} 条记录，请核对后确认导入，取消勾选可跳过某条。</Text>
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                {rows.map((r, i) => (
                  <CandidateCard key={i} r={r} onChange={(f) => updateRow(i, f)} categories={categories} accounts={accounts} />
                ))}
              </SimpleGrid>
              <div className="sticky-actions">
                <Button variant="default" onClick={resetImport}>取消，重新选择</Button>
                <Button onClick={handleConfirm} loading={saving} disabled={selectedCount === 0}>确认导入 {selectedCount} 条</Button>
              </div>
            </>
          )}
        </Stack>
      </div>
    </>
  );
}
