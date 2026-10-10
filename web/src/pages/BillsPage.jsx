import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  ActionIcon, Button, Center, Group, Input, Loader, Menu, Modal, NumberInput, SegmentedControl, SimpleGrid, Stack, Switch, Tabs, Text, TextInput,
} from '@mantine/core';
import { IconDotsVertical, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { confirmAction } from '../lib/confirm.jsx';
import { listRecurringBills, createRecurringBill, editRecurringBill, updateRecurringBill, deleteRecurringBill } from '../lib/api.js';
import { todayStr, money, categoryPath, WEEKDAYS, weekday } from '../lib/format.js';
import { billsAsAmounts, recurringTotals, yearlyAmount } from '../lib/billStats.js';
import PageHeader from '../components/PageHeader.jsx';
import { SummaryBar } from '../components/TransactionList.jsx';
import CategorySelect from '../components/CategorySelect.jsx';
import AccountSelect from '../components/AccountSelect.jsx';

// 饼图依赖 chart.js，懒加载，不进首屏包
const CategoryBreakdown = lazy(() => import('../components/CategoryBreakdown.jsx'));

const FREQUENCIES = [
  { label: '每月', value: 'monthly' },
  { label: '每两周', value: 'biweekly' },
  { label: '每周', value: 'weekly' },
  { label: '每天', value: 'daily' },
];

// 每周 / 每两周是从下次到期日往后按 7 / 14 天推的，所以星期几以到期日为准
function weekdayOf(dateStr) {
  return `周${WEEKDAYS[weekday(dateStr)]}`;
}

function formatFrequency(bill) {
  if (bill.frequency === 'daily') return '每天';
  if (bill.frequency === 'weekly') return `每${weekdayOf(bill.next_due_date)}`;
  if (bill.frequency === 'biweekly') return `每两周的${weekdayOf(bill.next_due_date)}`;
  return `每月 ${bill.day_of_month} 号`;
}

function scheduleHint(frequency, dayOfMonth, nextDueDate) {
  if (!nextDueDate) return null;
  if (frequency === 'daily') return '之后每天记一笔';
  if (frequency === 'weekly') return `之后每${weekdayOf(nextDueDate)}记一笔`;
  if (frequency === 'biweekly') return `之后每两周的${weekdayOf(nextDueDate)}记一笔（隔一周一次）`;
  return `之后每月 ${dayOfMonth || 1} 号记一笔`;
}

/** 新增和编辑定时账单共用的表单；传了 bill 就是编辑。 */
function BillForm({ bill, onDone }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, accounts } = useData();
  const isEdit = !!bill;

  const [name, setName] = useState(bill?.name || '');
  const [type, setType] = useState(bill?.type || 'expense');
  const [amount, setAmount] = useState(bill ? Number(bill.amount) : '');
  const [categoryId, setCategoryId] = useState(bill?.category_id || '');
  const [accountId, setAccountId] = useState(bill?.account_id || '');
  const [frequency, setFrequency] = useState(bill?.frequency || 'monthly');
  const [dayOfMonth, setDayOfMonth] = useState(bill?.day_of_month || 1);
  const [nextDueDate, setNextDueDate] = useState(bill?.next_due_date || todayStr());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !(Number(amount) > 0)) {
      showToast('请填写名称和大于 0 的金额', true);
      return;
    }
    const fields = {
      name: trimmed,
      type,
      amount: Number(amount),
      category_id: categoryId || null,
      account_id: accountId || null,
      frequency,
      day_of_week: weekday(nextDueDate),
      day_of_month: Number(dayOfMonth) || 1,
      next_due_date: nextDueDate,
    };
    setSaving(true);
    try {
      if (isEdit) {
        await editRecurringBill(client, bill.id, fields);
        showToast('已保存');
      } else {
        await createRecurringBill(client, fields);
        showToast('已添加定时账单');
      }
      onDone();
    } catch (err) {
      showToast((isEdit ? '保存失败：' : '添加失败：') + err.message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          data={[{ label: '支出', value: 'expense' }, { label: '收入', value: 'income' }]}
          value={type}
          color={type === 'income' ? 'blue' : 'coral'}
          onChange={(v) => { setType(v); setCategoryId(''); }}
        />
        <TextInput label="名称" placeholder="例如：房租、信用卡还款" required value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        <NumberInput label="金额" placeholder="0.00" value={amount} onChange={setAmount} decimalScale={2} min={0} allowNegative={false} thousandSeparator="," hideControls inputMode="decimal" />
        <SimpleGrid cols={2} spacing="sm">
          <CategorySelect label="分类" categories={categories} type={type} value={categoryId} onChange={setCategoryId} />
          <AccountSelect label="账户" accounts={accounts} value={accountId} onChange={setAccountId} />
        </SimpleGrid>
        <Input.Wrapper label="重复频率">
          <SegmentedControl fullWidth mt={4} data={FREQUENCIES} value={frequency} onChange={setFrequency} />
        </Input.Wrapper>
        <SimpleGrid cols={frequency === 'monthly' ? 2 : 1} spacing="sm">
          {frequency === 'monthly' && (
            <NumberInput label="每月第几天" value={dayOfMonth} onChange={setDayOfMonth} min={1} max={31} allowDecimal={false} />
          )}
          <TextInput
            type="date"
            label={isEdit ? '下次到期日' : '首次到期日'}
            required
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
          />
        </SimpleGrid>
        <Text size="sm" c="dimmed" mt={-8}>
          {scheduleHint(frequency, dayOfMonth, nextDueDate)}
          {isEdit && nextDueDate && nextDueDate <= todayStr() && '；下次到期日已经到了，下次打开网站时会补记'}
        </Text>
        <Button type="submit" loading={saving}>{isEdit ? '保存' : '添加'}</Button>
      </Stack>
    </form>
  );
}

export default function BillsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, ready } = useData();

  const [bills, setBills] = useState([]);
  // form: null = 关闭；{ bill: null } = 新增；{ bill } = 编辑
  const [form, setForm] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [period, setPeriod] = useState('monthly');
  const [pieType, setPieType] = useState('expense');

  const openForm = (bill) => {
    setForm({ bill });
    setFormKey((k) => k + 1);
  };

  const totals = recurringTotals(bills)[period];

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

  async function handleToggleActive(bill, active) {
    try {
      await updateRecurringBill(client, bill.id, { active });
      reload();
    } catch (e) {
      showToast('更新失败：' + e.message, true);
    }
  }

  async function handleDelete(bill) {
    const ok = await confirmAction({
      title: `删除「${bill.name}」`,
      message: '确认删除这个定时账单？已经生成的记账记录不会被删除。',
      confirmLabel: '删除',
    });
    if (!ok) return;
    try {
      await deleteRecurringBill(client, bill.id);
      showToast('已删除');
      reload();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
    }
  }

  return (
    <>
      <PageHeader
        title="定时账单"
        back="/more"
        right={(
          <>
            <Button size="sm" visibleFrom="sm" leftSection={<IconPlus size={16} />} onClick={() => openForm(null)}>新增定时账单</Button>
            <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" onClick={() => openForm(null)} aria-label="新增定时账单"><IconPlus size={22} /></ActionIcon>
          </>
        )}
      />
      <div className="page-body">
        <Stack gap="sm">
          {bills.length > 0 && (
            <>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600}>固定账单收支</Text>
                <SegmentedControl
                  size="xs"
                  data={[{ label: '月均', value: 'monthly' }, { label: '每年', value: 'yearly' }]}
                  value={period}
                  onChange={setPeriod}
                />
              </Group>
              <SummaryBar
                items={[
                  { label: '固定收入', value: money(totals.income), className: 'income' },
                  { label: '固定支出', value: money(totals.expense), className: 'expense' },
                  { label: '净流水', value: money(totals.net), className: totals.net < 0 ? 'expense' : 'income' },
                ]}
              />
              <Text size="xs" c="dimmed" mt={-4}>
                只算已启用的定时账单，按一年发生的次数折算：每天 365 次、每周 52 次、每两周 26 次、每月 12 次；月均 = 每年 ÷ 12。
              </Text>
              <div className="card">
                <Tabs value={pieType} onChange={(v) => setPieType(v || 'expense')} color={pieType === 'income' ? 'blue' : 'coral'}>
                  <Tabs.List grow>
                    <Tabs.Tab value="expense">支出占比</Tabs.Tab>
                    <Tabs.Tab value="income">收入占比</Tabs.Tab>
                  </Tabs.List>
                </Tabs>
              </div>
              <Suspense fallback={<Center py="md"><Loader size="sm" color="coral" /></Center>}>
                <CategoryBreakdown
                  key={pieType}
                  type={pieType}
                  transactions={billsAsAmounts(bills, period)}
                  categories={categories}
                  emptyText={`没有启用中的${pieType === 'income' ? '收入' : '支出'}定时账单`}
                />
              </Suspense>
            </>
          )}
          <Text size="sm" c="dimmed">
            到期后会自动记一笔并计入账户余额：后台每天有定时任务生成，打开网站时也会顺手补一次，不会漏记。
          </Text>
          <div className="card">
            {bills.length === 0 ? (
              <div className="empty-state">还没有定时账单，比如房租、订阅、工资都可以加进来</div>
            ) : bills.map((b) => (
              <div key={b.id} className="list-row" style={{ opacity: b.active ? 1 : 0.55 }}>
                <button type="button" className="category-main bill-main" onClick={() => openForm(b)}>
                  <Text fw={600} size="sm" truncate>{b.name}</Text>
                  <Text size="xs" c="dimmed" truncate>
                    {formatFrequency(b)} · 下次 {b.next_due_date}
                    {b.category_id ? ` · ${categoryPath(categories, b.category_id) || ''}` : ''}
                    {b.accounts?.name ? ` · ${b.accounts.name}` : ''}
                  </Text>
                </button>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <b className={b.type}>{money(b.amount)}</b>
                  {b.frequency !== 'monthly' && (
                    <Text size="xs" c="dimmed">月均 {money(yearlyAmount(b) / 12)}</Text>
                  )}
                </div>
                <Switch size="sm" checked={b.active} onChange={(e) => handleToggleActive(b, e.currentTarget.checked)} aria-label="启用" />
                <Menu position="bottom-end" withinPortal shadow="md">
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label="更多操作"><IconDotsVertical size={16} /></ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => openForm(b)}>编辑</Menu.Item>
                    <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => handleDelete(b)}>删除</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            ))}
          </div>
        </Stack>
      </div>

      <Modal
        opened={!!form}
        onClose={() => setForm(null)}
        title={<Text fw={700}>{form?.bill ? `编辑「${form.bill.name}」` : '新增定时账单'}</Text>}
        centered
        size="lg"
      >
        {form && <BillForm key={formKey} bill={form.bill} onDone={() => { setForm(null); reload(); }} />}
      </Modal>
    </>
  );
}
