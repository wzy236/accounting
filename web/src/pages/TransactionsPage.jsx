import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionIcon, Button, Loader, Center, Pill, Group, Stack, Tabs, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { listTransactionsForMonth } from '../lib/api.js';
import { defaultMonth, todayStr, fmt, money, monthLabel, shiftMonth } from '../lib/format.js';
import PageHeader, { PeriodSwitcher } from '../components/PageHeader.jsx';
import TransactionDrawer from '../components/TransactionDrawer.jsx';
import AccountFilter, { NO_ACCOUNT } from '../components/AccountFilter.jsx';
import { DayGroup, MonthCalendar, SummaryBar } from '../components/TransactionList.jsx';
import { dayTotals, groupByDate } from '../lib/txGroups.js';

export default function TransactionsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, accounts, refreshAccounts, ready } = useData();
  const [searchParams, setSearchParams] = useSearchParams();

  const [month, setMonth] = useState(defaultMonth());
  const [view, setView] = useState('daily');
  const [selectedDay, setSelectedDay] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState({ opened: false, tx: null, date: null, key: 0 });

  // 账户筛选放在网址里（?accounts=id1,id2），刷新不丢，账户页也能直接跳过来
  const accountFilter = (searchParams.get('accounts') || '').split(',').filter(Boolean);
  const setAccountFilter = (ids) => setSearchParams(ids.length ? { accounts: ids.join(',') } : {}, { replace: true });
  const filtering = accountFilter.length > 0;

  const reload = useCallback(async () => {
    try {
      setTransactions(await listTransactionsForMonth(client, month));
    } catch (e) {
      showToast('加载记录失败：' + e.message, true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, month]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  function changeMonth(delta) {
    setMonth((m) => shiftMonth(m, delta));
    setSelectedDay(null);
  }

  function openNew(date) {
    const fallback = month === defaultMonth() ? todayStr() : `${month}-01`;
    setDrawer((d) => ({ opened: true, tx: null, date: date || fallback, key: d.key + 1 }));
  }

  function openEdit(t) {
    setDrawer((d) => ({ opened: true, tx: t, date: null, key: d.key + 1 }));
  }

  function handleSaved() {
    reload();
    refreshAccounts();
  }

  function toggleAccountChip(id) {
    const key = String(id);
    setAccountFilter(accountFilter.length === 1 && accountFilter[0] === key ? [] : [key]);
  }

  const visible = filtering
    ? transactions.filter((t) => accountFilter.includes(t.account_id ? String(t.account_id) : NO_ACCOUNT))
    : transactions;

  const { income, expense } = dayTotals(visible);
  const groups = groupByDate(visible);
  const selectedItems = selectedDay ? visible.filter((t) => t.date === selectedDay) : [];

  // 只筛了一个账户时，记一笔默认就记到这个账户
  const defaultAccountId = accountFilter.length === 1 && accountFilter[0] !== NO_ACCOUNT ? accountFilter[0] : '';

  const filterLabel = (id) => (id === NO_ACCOUNT ? '未关联账户' : accounts.find((a) => String(a.id) === id)?.name || '已删除的账户');

  return (
    <>
      <PageHeader
        title="记账"
        center={<PeriodSwitcher label={monthLabel(month)} onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)} />}
        right={(
          <>
            {accounts.length > 0 && <AccountFilter accounts={accounts} value={accountFilter} onChange={setAccountFilter} />}
            <Button visibleFrom="sm" leftSection={<IconPlus size={18} />} onClick={() => openNew(view === 'calendar' ? selectedDay : null)}>记一笔</Button>
          </>
        )}
      />
      <div className="page-body">
        <Stack gap="sm">
          <div className="card">
            <Tabs value={view} onChange={(v) => setView(v || 'daily')}>
              <Tabs.List grow>
                <Tabs.Tab value="daily">每日</Tabs.Tab>
                <Tabs.Tab value="calendar">日历</Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </div>

          {filtering && (
            <div className="filter-bar">
              <Text size="xs" c="dimmed" span>只看</Text>
              <Group gap={6} style={{ flex: 1, minWidth: 0 }}>
                {accountFilter.map((id) => (
                  <Pill key={id} withRemoveButton onRemove={() => setAccountFilter(accountFilter.filter((x) => x !== id))}>
                    {filterLabel(id)}
                  </Pill>
                ))}
              </Group>
              <Button variant="subtle" size="compact-xs" color="gray" onClick={() => setAccountFilter([])}>清除</Button>
            </div>
          )}

          <SummaryBar
            items={[
              { label: '收入', value: money(income), className: 'income' },
              { label: '支出', value: money(expense), className: 'expense' },
              { label: '结余', value: money(income - expense) },
            ]}
          />

          {accounts.length > 0 && (
            <div className="account-strip">
              {accounts.map((a) => {
                const selected = accountFilter.includes(String(a.id));
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`account-chip${selected ? ' selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => toggleAccountChip(a.id)}
                  >
                    <span className="dot" style={{ background: a.color }} />
                    <span className="muted">{a.name}</span>
                    <b className={a.balance < 0 ? 'expense' : 'income'}>{fmt(a.balance)}</b>
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <Center py="xl"><Loader color="coral" size="sm" /></Center>
          ) : view === 'daily' ? (
            groups.length === 0 ? (
              <div className="card empty-state">
                {filtering ? '这个月所选账户没有记录' : '这个月还没有记录，点右下角的 + 记一笔吧'}
              </div>
            ) : (
              groups.map(([date, items]) => (
                <DayGroup key={date} date={date} items={items} categories={categories} onSelect={openEdit} />
              ))
            )
          ) : (
            <>
              <MonthCalendar month={month} transactions={visible} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
              {selectedDay && (selectedItems.length > 0 ? (
                <DayGroup date={selectedDay} items={selectedItems} categories={categories} onSelect={openEdit} />
              ) : (
                <div className="card empty-state">
                  <Text size="sm" c="dimmed" mb="xs">这天没有记录</Text>
                  <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => openNew(selectedDay)}>记一笔</Button>
                </div>
              ))}
            </>
          )}
        </Stack>
      </div>

      <ActionIcon
        className="fab"
        size={56}
        radius="xl"
        aria-label="记一笔"
        onClick={() => openNew(view === 'calendar' ? selectedDay : null)}
      >
        <IconPlus size={28} />
      </ActionIcon>

      <TransactionDrawer
        opened={drawer.opened}
        onClose={() => setDrawer((d) => ({ ...d, opened: false }))}
        onSaved={handleSaved}
        tx={drawer.tx}
        defaultDate={drawer.date}
        defaultAccountId={defaultAccountId}
        formKey={drawer.key}
      />
    </>
  );
}
