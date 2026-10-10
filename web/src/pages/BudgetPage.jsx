import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionIcon, Alert, Button, Center, Group, Loader, Menu, Modal, NumberInput, SegmentedControl, Stack, Switch, Tabs, Text, TextInput,
} from '@mantine/core';
import { IconDotsVertical, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { confirmAction } from '../lib/confirm.jsx';
import {
  listBudgetItems, createBudgetItem, editBudgetItem, updateBudgetItem, deleteBudgetItem,
  listRecurringBills, updateRecurringBill,
} from '../lib/api.js';
import { asAmounts, billInBudget, totalsOf, yearlyAmount } from '../lib/billStats.js';
import { categoryPath, money } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import CategorySelect from '../components/CategorySelect.jsx';
import { SummaryBar } from '../components/TransactionList.jsx';

// 饼图依赖 chart.js，懒加载，不进首屏包
const CategoryBreakdown = lazy(() => import('../components/CategoryBreakdown.jsx'));

const FREQ_LABEL = { daily: '每天', weekly: '每周', biweekly: '每两周', monthly: '每月', yearly: '每年' };
const ITEM_FREQUENCIES = ['monthly', 'yearly', 'biweekly', 'weekly', 'daily'].map((v) => ({ value: v, label: FREQ_LABEL[v] }));

function BudgetItemForm({ item, onDone }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories } = useData();
  const isEdit = !!item;

  const [type, setType] = useState(item?.type || 'expense');
  const [name, setName] = useState(item?.name || '');
  const [amount, setAmount] = useState(item ? Number(item.amount) : '');
  const [frequency, setFrequency] = useState(item?.frequency || 'monthly');
  const [categoryId, setCategoryId] = useState(item?.category_id || '');
  const [included, setIncluded] = useState(item ? item.included : true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !(Number(amount) > 0)) {
      showToast('请填写名称和大于 0 的金额', true);
      return;
    }
    const fields = { name: trimmed, type, amount: Number(amount), frequency, category_id: categoryId || null, included };
    setSaving(true);
    try {
      if (isEdit) {
        await editBudgetItem(client, item.id, fields);
        showToast('已保存');
      } else {
        await createBudgetItem(client, fields);
        showToast('已添加预计项目');
      }
      onDone();
    } catch (err) {
      showToast((isEdit ? '保存失败：' : '添加失败：') + err.message, true);
    } finally {
      setSaving(false);
    }
  }

  const monthly = Number(amount) > 0 ? yearlyAmount({ amount, frequency }) / 12 : null;

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
        <TextInput label="名称" placeholder={type === 'income' ? '例如：副业收入' : '例如：买菜、旅行'} required value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        <NumberInput label="预计金额" placeholder="0.00" value={amount} onChange={setAmount} decimalScale={2} min={0} allowNegative={false} thousandSeparator="," hideControls inputMode="decimal" />
        <SegmentedControl fullWidth data={ITEM_FREQUENCIES} value={frequency} onChange={setFrequency} />
        {monthly != null && frequency !== 'monthly' && (
          <Text size="sm" c="dimmed" mt={-8}>折算月均 {money(monthly)}</Text>
        )}
        <CategorySelect label="分类" categories={categories} type={type} value={categoryId} onChange={setCategoryId} />
        <Switch label="计入预算" checked={included} onChange={(e) => setIncluded(e.currentTarget.checked)} />
        <Button type="submit" loading={saving}>{isEdit ? '保存' : '添加'}</Button>
      </Stack>
    </form>
  );
}

function BudgetRow({ name, meta, item, included, onToggle, onEdit, menu }) {
  const main = (
    <>
      <Text fw={600} size="sm" truncate>{name}</Text>
      <Text size="xs" c="dimmed" truncate>{meta}</Text>
    </>
  );
  return (
    <div className="list-row" style={{ opacity: included ? 1 : 0.55 }}>
      {onEdit ? (
        <button type="button" className="category-main bill-main" onClick={onEdit}>{main}</button>
      ) : (
        <div className="list-row-main">{main}</div>
      )}
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <b className={item.type}>{money(item.amount)}</b>
        {item.frequency !== 'monthly' && <Text size="xs" c="dimmed">月均 {money(yearlyAmount(item) / 12)}</Text>}
      </div>
      <Switch size="sm" checked={included} onChange={(e) => onToggle(e.currentTarget.checked)} aria-label={`「${name}」计入预算`} />
      {menu}
    </div>
  );
}

export default function BudgetPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, ready } = useData();

  const [items, setItems] = useState([]);
  const [bills, setBills] = useState([]);
  const [itemsError, setItemsError] = useState('');
  const [period, setPeriod] = useState('monthly');
  const [pieType, setPieType] = useState('expense');
  const [form, setForm] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const reload = useCallback(async () => {
    const [itemsRes, billsRes] = await Promise.allSettled([listBudgetItems(client), listRecurringBills(client)]);
    if (itemsRes.status === 'fulfilled') {
      setItems(itemsRes.value);
      setItemsError('');
    } else {
      setItemsError(itemsRes.reason?.message || String(itemsRes.reason));
    }
    if (billsRes.status === 'fulfilled') setBills(billsRes.value);
    else showToast('加载定时账单失败：' + billsRes.reason?.message, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const openForm = (item) => {
    setForm({ item });
    setFormKey((k) => k + 1);
  };

  async function toggleItem(item, included) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, included } : i)));
    try {
      await updateBudgetItem(client, item.id, { included });
    } catch (e) {
      showToast('更新失败：' + e.message, true);
      reload();
    }
  }

  async function toggleBill(bill, inBudget) {
    setBills((prev) => prev.map((b) => (b.id === bill.id ? { ...b, in_budget: inBudget } : b)));
    try {
      await updateRecurringBill(client, bill.id, { in_budget: inBudget });
    } catch (e) {
      showToast('更新失败：' + e.message, true);
      reload();
    }
  }

  async function handleDelete(item) {
    const ok = await confirmAction({ title: `删除「${item.name}」`, message: '确认删除这个预计项目？', confirmLabel: '删除' });
    if (!ok) return;
    try {
      await deleteBudgetItem(client, item.id);
      showToast('已删除');
      reload();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
    }
  }

  const activeBills = bills.filter((b) => b.active);
  const pausedCount = bills.length - activeBills.length;
  const countedItems = items.filter((i) => i.included);
  const countedBills = activeBills.filter(billInBudget);
  const counted = [...countedItems, ...countedBills];
  const totals = totalsOf(counted)[period];

  const metaOf = (x) => [FREQ_LABEL[x.frequency], categoryPath(categories, x.category_id)].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        title="预算"
        back="/more"
        right={(
          <>
            <Button size="sm" visibleFrom="sm" leftSection={<IconPlus size={16} />} onClick={() => openForm(null)}>新增预计项目</Button>
            <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" onClick={() => openForm(null)} aria-label="新增预计项目"><IconPlus size={22} /></ActionIcon>
          </>
        )}
      />
      <div className="page-body">
        <Stack gap="sm">
          {itemsError && (
            <Alert color="yellow" variant="light" title="预计项目还用不了">
              数据库里还没有预算用的表（{itemsError}）。请在 Supabase 的 SQL Editor 里重新运行一次 sql/schema.sql。
            </Alert>
          )}

          <Group justify="space-between" wrap="nowrap">
            <Text fw={600}>预算收支</Text>
            <SegmentedControl
              size="xs"
              data={[{ label: '月均', value: 'monthly' }, { label: '每年', value: 'yearly' }]}
              value={period}
              onChange={setPeriod}
            />
          </Group>
          <SummaryBar
            items={[
              { label: '预算收入', value: money(totals.income), className: 'income' },
              { label: '预算支出', value: money(totals.expense), className: 'expense' },
              { label: '结余', value: money(totals.net), className: totals.net < 0 ? 'expense' : 'income' },
            ]}
          />
          <Text size="xs" c="dimmed" mt={-4}>
            算进去的：{countedItems.length} 个预计项目 + {countedBills.length} 个定时账单。关掉右边的开关就不计入；按一年发生的次数折算，月均 = 每年 ÷ 12。
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
              transactions={asAmounts(counted, period)}
              categories={categories}
              emptyText={`预算里还没有${pieType === 'income' ? '收入' : '支出'}`}
            />
          </Suspense>

          <Group justify="space-between" mt="sm">
            <Text fw={600}>预计项目</Text>
            <Button variant="subtle" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={() => openForm(null)}>添加</Button>
          </Group>
          <div className="card">
            {items.length === 0 ? (
              <div className="empty-state">还没有预计项目。比如每月买菜、每年旅行、偶尔的副业收入，都可以加进来估算</div>
            ) : items.map((it) => (
              <BudgetRow
                key={it.id}
                name={it.name}
                meta={metaOf(it)}
                item={it}
                included={it.included}
                onToggle={(v) => toggleItem(it, v)}
                onEdit={() => openForm(it)}
                menu={(
                  <Menu position="bottom-end" withinPortal shadow="md">
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" aria-label={`「${it.name}」更多操作`}><IconDotsVertical size={16} /></ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => openForm(it)}>编辑</Menu.Item>
                      <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => handleDelete(it)}>删除</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              />
            ))}
          </div>

          <Group justify="space-between" mt="sm">
            <Text fw={600}>定时账单</Text>
            <Button component={Link} to="/bills" variant="subtle" size="compact-sm">管理定时账单</Button>
          </Group>
          <div className="card">
            {activeBills.length === 0 ? (
              <div className="empty-state">没有启用中的定时账单</div>
            ) : activeBills.map((b) => (
              <BudgetRow
                key={b.id}
                name={b.name}
                meta={metaOf(b)}
                item={b}
                included={billInBudget(b)}
                onToggle={(v) => toggleBill(b, v)}
              />
            ))}
          </div>
          {pausedCount > 0 && <Text size="xs" c="dimmed">另有 {pausedCount} 个已停用的定时账单，不计入预算。</Text>}
        </Stack>
      </div>

      <Modal
        opened={!!form}
        onClose={() => setForm(null)}
        title={<Text fw={700}>{form?.item ? `编辑「${form.item.name}」` : '新增预计项目'}</Text>}
        centered
      >
        {form && <BudgetItemForm key={formKey} item={form.item} onDone={() => { setForm(null); reload(); }} />}
      </Modal>
    </>
  );
}
