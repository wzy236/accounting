import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon, Button, Input, Menu, Modal, NumberInput, SegmentedControl, SimpleGrid, Stack, Switch, Text, TextInput,
} from '@mantine/core';
import { IconDotsVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { confirmAction } from '../lib/confirm.jsx';
import { listRecurringBills, createRecurringBill, updateRecurringBill, deleteRecurringBill } from '../lib/api.js';
import { todayStr, money, categoryPath, WEEKDAYS, weekday } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import CategorySelect from '../components/CategorySelect.jsx';
import AccountSelect from '../components/AccountSelect.jsx';

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

function NewBillForm({ onDone }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, accounts } = useData();

  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [nextDueDate, setNextDueDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !(Number(amount) > 0)) {
      showToast('请填写名称和大于 0 的金额', true);
      return;
    }
    setSaving(true);
    try {
      await createRecurringBill(client, {
        name: trimmed,
        type,
        amount: Number(amount),
        category_id: categoryId || null,
        account_id: accountId || null,
        frequency,
        day_of_week: weekday(nextDueDate),
        day_of_month: Number(dayOfMonth) || 1,
        next_due_date: nextDueDate,
      });
      showToast('已添加定时账单');
      onDone();
    } catch (err) {
      showToast('添加失败：' + err.message, true);
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
          <TextInput type="date" label="首次到期日" required value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
        </SimpleGrid>
        <Text size="sm" c="dimmed" mt={-8}>{scheduleHint(frequency, dayOfMonth, nextDueDate)}</Text>
        <Button type="submit" loading={saving}>添加</Button>
      </Stack>
    </form>
  );
}

export default function BillsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, ready } = useData();

  const [bills, setBills] = useState([]);
  const [newOpened, setNewOpened] = useState(false);

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
            <Button size="sm" visibleFrom="sm" leftSection={<IconPlus size={16} />} onClick={() => setNewOpened(true)}>新增定时账单</Button>
            <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" onClick={() => setNewOpened(true)} aria-label="新增定时账单"><IconPlus size={22} /></ActionIcon>
          </>
        )}
      />
      <div className="page-body">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            到期后会自动记一笔并计入账户余额：后台每天有定时任务生成，打开网站时也会顺手补一次，不会漏记。
          </Text>
          <div className="card">
            {bills.length === 0 ? (
              <div className="empty-state">还没有定时账单，比如房租、订阅、工资都可以加进来</div>
            ) : bills.map((b) => (
              <div key={b.id} className="list-row">
                <div className="list-row-main" style={{ whiteSpace: 'normal' }}>
                  <Text fw={600} size="sm" truncate>{b.name}</Text>
                  <Text size="xs" c="dimmed" truncate>
                    {formatFrequency(b)} · 下次 {b.next_due_date}
                    {b.category_id ? ` · ${categoryPath(categories, b.category_id) || ''}` : ''}
                    {b.accounts?.name ? ` · ${b.accounts.name}` : ''}
                  </Text>
                </div>
                <b className={b.type}>{money(b.amount)}</b>
                <Switch size="sm" checked={b.active} onChange={(e) => handleToggleActive(b, e.currentTarget.checked)} aria-label="启用" />
                <Menu position="bottom-end" withinPortal shadow="md">
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label="更多操作"><IconDotsVertical size={16} /></ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => handleDelete(b)}>删除</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            ))}
          </div>
        </Stack>
      </div>

      <Modal opened={newOpened} onClose={() => setNewOpened(false)} title={<Text fw={700}>新增定时账单</Text>} centered size="lg">
        {newOpened && <NewBillForm onDone={() => { setNewOpened(false); reload(); }} />}
      </Modal>
    </>
  );
}
