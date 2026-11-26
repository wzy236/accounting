import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, Checkbox, Code, FileInput, Group, Loader, NumberInput, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput,
} from '@mantine/core';
import { IconDownload, IconFileImport, IconInfoCircle } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { createTransactionsBulk, transferRows } from '../lib/api.js';
import { HOME_CURRENCY, fetchRatesToHome, round2 } from '../lib/currency.js';
import { extractTextFromPdf } from '../lib/pdfExtract.js';
import { parseStatementText } from '../lib/bankStatementParser.js';
import { extractCandidatesFromCsv, extractCandidatesFromExcel } from '../lib/spreadsheetImport.js';
import { matchAccount, matchCategory } from '../lib/importMatch.js';
import { downloadCsv } from '../lib/exportData.js';
import PageHeader from '../components/PageHeader.jsx';
import CategorySelect from '../components/CategorySelect.jsx';
import AccountSelect from '../components/AccountSelect.jsx';

const EXAMPLE_CSV = `日期,描述,金额,分类,子分类,账户
2026-10-01,工资入账,6000.00,工资,,
2026-10-02,Costco,-158.60,购物,,
2026-10-03,Starbucks,-6.25,餐饮,咖啡,
2026-10-05,Presto 月票,-156.00,交通,,
2026-10-08,Amazon 退款,25.99,,,
2026-10-12,朋友转账,500.00,其他收入,,
`;

// 标准 CSV 的列说明（表头写中文或常见的英文列名都认）
const FORMAT_COLUMNS = [
  ['日期', '必填', '2026-10-05、2026/10/05、10/05/2026、2026年10月5日 都可以'],
  ['金额', '必填', '负数是支出，正数是收入；也可以不要这一列，改用「支出」「收入」两列（Debit / Credit）'],
  ['描述', '可选', '商家或备注'],
  ['分类、子分类', '可选', '写网站里已有的分类名，导入时自动选好；也可以只用分类一列写成「餐饮 · 咖啡」'],
  ['账户', '可选', '写网站里的账户名；留空的话，导入时可以一次给全部记录选账户'],
  ['转入账户', '可选', '填了这一列（或「类型」写转账）就导入成账户间转账，不算收支，这时「账户」是转出账户；比如信用卡还款'],
];

const TYPE_DATA = [{ label: '支出', value: 'expense' }, { label: '收入', value: 'income' }, { label: '转账', value: 'transfer' }];
const TYPE_COLOR = { expense: 'coral', income: 'blue', transfer: 'gray' };

/** 在收支和转账之间切换时把账户挪到对的位置：收入那条的账户是收钱的一方，改成转账就放到「转入」，反过来也一样。 */
function switchType(r, type) {
  const fields = { type, category_id: '' };
  if (type === 'transfer' && r.type === 'income') Object.assign(fields, { account_id: '', to_account_id: r.account_id });
  if (r.type === 'transfer' && type === 'income') Object.assign(fields, { account_id: r.to_account_id || '', to_account_id: '' });
  if (r.type === 'transfer' && type === 'expense') fields.to_account_id = '';
  return fields;
}

const listNames = (names) => (names.length > 8 ? `${names.slice(0, 8).join('、')} 等 ${names.length} 个` : names.join('、'));

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
            data={TYPE_DATA}
            value={r.type}
            color={TYPE_COLOR[r.type]}
            onChange={(v) => onChange(switchType(r, v))}
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
        {r.type === 'transfer' ? (
          <SimpleGrid cols={2} spacing="xs">
            <AccountSelect size="xs" placeholder="转出账户" aria-label="转出账户" accounts={accounts} value={r.account_id} onChange={(v) => onChange({ account_id: v })} />
            <AccountSelect size="xs" placeholder="转入账户" aria-label="转入账户" accounts={accounts} value={r.to_account_id} onChange={(v) => onChange({ to_account_id: v })} />
          </SimpleGrid>
        ) : (
          <SimpleGrid cols={2} spacing="xs">
            <CategorySelect size="xs" categories={categories} type={r.type} value={r.category_id} onChange={(v) => onChange({ category_id: v })} />
            <AccountSelect size="xs" accounts={accounts} value={r.account_id} onChange={(v) => onChange({ account_id: v })} />
          </SimpleGrid>
        )}
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
  const [missing, setMissing] = useState({ categories: [], accounts: [] }); // CSV 里写了、但网站里没有的分类/账户名

  function resetImport() {
    setRows(null);
    setMissing({ categories: [], accounts: [] });
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
      // CSV 里写了分类名 / 账户名的，对应到网站里已有的分类和账户
      const missingCategories = new Set();
      const missingAccounts = new Set();
      setRows(candidates.map((c) => {
        const category = c.type === 'transfer' ? { id: '', missing: null } : matchCategory(categories, c.type, c.categoryName, c.subcategoryName);
        const account = matchAccount(accounts, c.accountName);
        const toAccount = matchAccount(accounts, c.toAccountName);
        if (category.missing) missingCategories.add(category.missing);
        for (const a of [account, toAccount]) if (a.missing) missingAccounts.add(a.missing);
        return {
          date: c.date, description: c.description, amount: c.amount, type: c.type,
          include: true, category_id: category.id, account_id: account.id, to_account_id: toAccount.id,
        };
      }));
      setMissing({ categories: [...missingCategories], accounts: [...missingAccounts] });
    } catch (err) {
      setError('解析文件失败：' + err.message);
    } finally {
      setParsing(false);
    }
  }

  function updateRow(index, fields) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...fields } : r)));
    setError(''); // 改过之后上一次的报错（比如转账没选账户）就不作数了
  }

  // 「全部记录的账户」只管收支记录（转账的转出/转入在各条里单独选）；这些记录账户一致时显示那个账户，否则留空
  function setAllAccounts(accountId) {
    setRows((prev) => prev.map((r) => (r.type === 'transfer' ? r : { ...r, account_id: accountId })));
  }

  const selectedCount = rows ? rows.filter((r) => r.include).length : 0;
  const plainRows = rows ? rows.filter((r) => r.type !== 'transfer') : [];
  const hasTransfers = plainRows.length < (rows?.length || 0);
  const commonAccount = plainRows.length && plainRows.every((r) => r.account_id === plainRows[0].account_id) ? plainRows[0].account_id : '';

  async function handleConfirm() {
    const selected = rows.filter((r) => r.include && r.date && Number(r.amount) > 0);
    if (selected.length === 0) {
      showToast('没有勾选任何记录', true);
      return;
    }
    const accountOf = (id) => accounts.find((a) => String(a.id) === String(id));
    const badTransfer = selected.find((r) => r.type === 'transfer'
      && (!accountOf(r.account_id) || !accountOf(r.to_account_id) || String(r.account_id) === String(r.to_account_id)));
    if (badTransfer) {
      setError(`转账「${badTransfer.date} ${badTransfer.description || ''}」要选好两个不同的转出、转入账户`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      // 导入到外币账户的记录，对账单上的金额就是这个账户的币种，换算成 CAD 再存
      const ccyOf = (id) => accountOf(id)?.currency || HOME_CURRENCY;
      const rates = await fetchRatesToHome(selected.flatMap((r) => [ccyOf(r.account_id), ccyOf(r.to_account_id)]));
      const rateOf = (ccy) => {
        if (!rates[ccy]) throw new Error(`查不到 ${ccy} 的实时汇率，请稍后再试`);
        return rates[ccy];
      };
      const toInsert = [];
      for (const r of selected) {
        const amount = Number(r.amount);
        const description = r.description.trim();
        if (r.type === 'transfer') {
          // 转账写成一对记录（和「记一笔」里的转账一样）；两边币种不同时，转入金额按实时汇率换算
          const from = accountOf(r.account_id);
          const to = accountOf(r.to_account_id);
          const toAmount = ccyOf(from.id) === ccyOf(to.id) ? undefined : round2((amount * rateOf(ccyOf(from.id))) / rateOf(ccyOf(to.id)));
          toInsert.push(...(await transferRows({ date: r.date, from, to, fromAmount: amount, toAmount, description })));
          continue;
        }
        const row = {
          date: r.date, type: r.type, amount, category_id: r.category_id || null, account_id: r.account_id || null, description, source: 'pdf_import',
        };
        const ccy = ccyOf(r.account_id);
        if (ccy === HOME_CURRENCY) toInsert.push(row);
        else toInsert.push({ ...row, amount: round2(amount * rateOf(ccy)), currency: ccy, original_amount: amount, exchange_rate: rateOf(ccy) });
      }
      await createTransactionsBulk(client, toInsert);
      const transfers = selected.filter((r) => r.type === 'transfer').length;
      showToast(`成功导入 ${selected.length} 条记录${transfers ? `（其中 ${transfers} 笔转账）` : ''}`);
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
                  <Text fw={600} size="sm">标准 CSV 格式</Text>
                  <Text size="sm" c="dimmed">第一行是表头，列的顺序随意；Excel 也一样，只读第一个工作表。</Text>
                  <Table className="format-table" verticalSpacing={6} fz="sm">
                    <Table.Tbody>
                      {FORMAT_COLUMNS.map(([column, required, note]) => (
                        <Table.Tr key={column}>
                          <Table.Td fw={600} style={{ whiteSpace: 'nowrap' }}>{column}</Table.Td>
                          <Table.Td c={required === '必填' ? undefined : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>{required}</Table.Td>
                          <Table.Td c="dimmed">{note}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                  <Code block className="example-csv">{EXAMPLE_CSV}</Code>
                  <Text size="xs" c="dimmed">
                    没有表头的文件也能导入：每一行只要能找到日期和两位小数的金额就行（PDF 也按这个规则识别），分类和账户导入时再选。
                  </Text>
                  <Group>
                    <Button variant="light" size="xs" leftSection={<IconDownload size={14} />} onClick={() => downloadCsv('对账单导入示例.csv', EXAMPLE_CSV)}>下载示例 CSV</Button>
                  </Group>
                </Stack>
              </div>
            </>
          ) : (
            <>
              <div className="card">
                <Stack gap="xs" p="sm">
                  <Text size="sm" c="dimmed">识别到 {rows.length} 条记录，请核对后确认导入，取消勾选可跳过某条。</Text>
                  {accounts.length > 0 && plainRows.length > 0 && (
                    <AccountSelect
                      label="全部记录的账户"
                      description={`选一个，所有${hasTransfers ? '收支' : ''}记录一次设好；之后也可以逐条再改${hasTransfers ? '（转账的转出、转入账户在各条里单独选）' : ''}`}
                      placeholder={plainRows.some((r) => r.account_id) ? '各条不一样' : '不选择'}
                      accounts={accounts}
                      value={commonAccount}
                      onChange={setAllAccounts}
                    />
                  )}
                </Stack>
              </div>
              {(missing.categories.length > 0 || missing.accounts.length > 0) && (
                <Alert color="yellow" icon={<IconInfoCircle size={18} />} title="有些名字在网站里没找到">
                  <Stack gap={4}>
                    {missing.categories.length > 0 && (
                      <Text size="sm">
                        分类：{listNames(missing.categories)}。
                        {missing.categories.some((n) => n.includes(' · ')) ? '子分类没找到的先归到了大类，其余的先空着。' : '这些记录的分类先空着。'}
                        可以先去「分类管理」建好再重新导入，或者在下面手动选。
                      </Text>
                    )}
                    {missing.accounts.length > 0 && (
                      <Text size="sm">账户：{listNames(missing.accounts)}。这些记录的账户先空着，可以用上面的「全部记录的账户」或逐条选。</Text>
                    )}
                  </Stack>
                </Alert>
              )}
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
