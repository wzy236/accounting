import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionIcon, Button, Loader, Center, Stack, Tabs, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { listTransactionsForMonth } from '../lib/api.js';
import { defaultMonth, todayStr, fmt, money, monthLabel, shiftMonth } from '../lib/format.js';
import PageHeader, { PeriodSwitcher } from '../components/PageHeader.jsx';
import TransactionDrawer from '../components/TransactionDrawer.jsx';
import { DayGroup, MonthCalendar, SummaryBar } from '../components/TransactionList.jsx';
import { dayTotals, groupByDate } from '../lib/txGroups.js';

export default function TransactionsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, accounts, refreshAccounts, ready } = useData();

  const [month, setMonth] = useState(defaultMonth());
  const [view, setView] = useState('daily');
  const [selectedDay, setSelectedDay] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState({ opened: false, tx: null, date: null, key: 0 });

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

  const { income, expense } = dayTotals(transactions);
  const groups = groupByDate(transactions);
  const selectedItems = selectedDay ? transactions.filter((t) => t.date === selectedDay) : [];

  return (
    <>
      <PageHeader
        title="记账"
        center={<PeriodSwitcher label={monthLabel(month)} onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)} />}
        right={<Button visibleFrom="sm" leftSection={<IconPlus size={18} />} onClick={() => openNew(view === 'calendar' ? selectedDay : null)}>记一笔</Button>}
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

          <SummaryBar
            items={[
              { label: '收入', value: money(income), className: 'income' },
              { label: '支出', value: money(expense), className: 'expense' },
              { label: '结余', value: money(income - expense) },
            ]}
          />

          {accounts.length > 0 && (
            <div className="account-strip">
              {accounts.map((a) => (
                <Link key={a.id} to="/accounts" className="account-chip">
                  <span className="dot" style={{ background: a.color }} />
                  <span className="muted">{a.name}</span>
                  <b className={a.balance < 0 ? 'expense' : 'income'}>{fmt(a.balance)}</b>
                </Link>
              ))}
            </div>
          )}

          {loading ? (
            <Center py="xl"><Loader color="coral" size="sm" /></Center>
          ) : view === 'daily' ? (
            groups.length === 0 ? (
              <div className="card empty-state">这个月还没有记录，点右下角的 + 记一笔吧</div>
            ) : (
              groups.map(([date, items]) => (
                <DayGroup key={date} date={date} items={items} categories={categories} onSelect={openEdit} />
              ))
            )
          ) : (
            <>
              <MonthCalendar month={month} transactions={transactions} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
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
        formKey={drawer.key}
      />
    </>
  );
}
