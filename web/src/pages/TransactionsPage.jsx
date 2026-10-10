import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionIcon, Button, Loader, Center, Pill, Group, Stack, Tabs, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { listTransactionsForMonth, listTransactionsInRange } from '../lib/api.js';
import { defaultMonth, todayStr, fmtIn, money, monthLabel, shiftMonth } from '../lib/format.js';
import PageHeader, { PeriodSwitcher } from '../components/PageHeader.jsx';
import TransactionDrawer from '../components/TransactionDrawer.jsx';
import TransactionFilter, { NO_ACCOUNT } from '../components/TransactionFilter.jsx';
import { DayGroup, MonthCalendar, SummaryBar } from '../components/TransactionList.jsx';
import { dayTotals, groupByDate } from '../lib/txGroups.js';

// 「全部日期」时记录可能很多，先渲染这么多天，剩下的点「显示更多」再加
const DAYS_PER_PAGE = 60;

function MonthHeader({ month, totals }) {
  return (
    <div className="month-header">
      <span>{monthLabel(month)}</span>
      <span className="month-header-totals">
        {totals.income > 0 && <span className="income">{money(totals.income)}</span>}
        {totals.expense > 0 && <span className="expense">{money(totals.expense)}</span>}
      </span>
    </div>
  );
}

export default function TransactionsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, accounts, refreshAccounts, ready } = useData();
  const [searchParams, setSearchParams] = useSearchParams();

  const [month, setMonth] = useState(defaultMonth());
  const [view, setView] = useState('daily');
  const [selectedDay, setSelectedDay] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadedKey, setLoadedKey] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [shownDays, setShownDays] = useState(DAYS_PER_PAGE);
  const [drawer, setDrawer] = useState({ opened: false, tx: null, date: null, key: 0 });

  // 筛选条件放在网址里（?accounts=id1,id2&range=all），刷新不丢，账户页也能直接跳过来
  const accountFilter = (searchParams.get('accounts') || '').split(',').filter(Boolean);
  const range = searchParams.get('range') === 'all' ? 'all' : 'month';

  function writeParams({ accounts: ids = accountFilter, range: r = range }) {
    const next = {};
    if (ids.length) next.accounts = ids.join(',');
    if (r === 'all') next.range = 'all';
    setSearchParams(next, { replace: true });
  }
  const setAccountFilter = (ids) => writeParams({ accounts: ids });
  function setRange(r) {
    writeParams({ range: r });
    setShownDays(DAYS_PER_PAGE);
    setSelectedDay(null);
  }
  const clearFilters = () => writeParams({ accounts: [], range: 'month' });

  const queryKey = range === 'all' ? 'all' : month;
  const loading = loadedKey !== queryKey;

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    const load = queryKey === 'all' ? listTransactionsInRange(client) : listTransactionsForMonth(client, queryKey);
    load
      .then((rows) => { if (!cancelled) setTransactions(rows); })
      .catch((e) => { if (!cancelled) showToast('加载记录失败：' + e.message, true); })
      .finally(() => { if (!cancelled) setLoadedKey(queryKey); });
    // 切月份/范围时旧请求的结果直接丢掉，避免慢的旧请求覆盖新数据
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, client, queryKey, reloadTick]);

  function changeMonth(delta) {
    setMonth((m) => shiftMonth(m, delta));
    setSelectedDay(null);
  }

  function openNew(date) {
    const fallback = range === 'all' || month === defaultMonth() ? todayStr() : `${month}-01`;
    setDrawer((d) => ({ opened: true, tx: null, date: date || fallback, key: d.key + 1 }));
  }

  function openEdit(t) {
    setDrawer((d) => ({ opened: true, tx: t, date: null, key: d.key + 1 }));
  }

  function handleSaved() {
    setReloadTick((t) => t + 1);
    refreshAccounts();
  }

  function toggleAccountChip(id) {
    const key = String(id);
    setAccountFilter(accountFilter.length === 1 && accountFilter[0] === key ? [] : [key]);
  }

  const filteringAccounts = accountFilter.length > 0;
  const visible = filteringAccounts
    ? transactions.filter((t) => accountFilter.includes(t.account_id ? String(t.account_id) : NO_ACCOUNT))
    : transactions;

  const effectiveView = range === 'all' ? 'daily' : view;
  const { income, expense } = dayTotals(visible);
  const groups = groupByDate(visible);
  const shownGroups = range === 'all' ? groups.slice(0, shownDays) : groups;
  const selectedItems = selectedDay ? visible.filter((t) => t.date === selectedDay) : [];

  const monthTotals = new Map();
  if (range === 'all') {
    for (const [date, items] of groups) {
      const m = date.slice(0, 7);
      const day = dayTotals(items);
      const acc = monthTotals.get(m) || { income: 0, expense: 0 };
      monthTotals.set(m, { income: acc.income + day.income, expense: acc.expense + day.expense });
    }
  }

  // 只筛了一个账户时，记一笔默认就记到这个账户
  const defaultAccountId = accountFilter.length === 1 && accountFilter[0] !== NO_ACCOUNT ? accountFilter[0] : '';
  const filterLabel = (id) => (id === NO_ACCOUNT ? '未关联账户' : accounts.find((a) => String(a.id) === id)?.name || '已删除的账户');

  let emptyText = '这个月还没有记录，点右下角的 + 记一笔吧';
  if (range === 'all') emptyText = filteringAccounts ? '所选账户还没有任何记录' : '还没有任何记录，点右下角的 + 记一笔吧';
  else if (filteringAccounts) emptyText = '这个月所选账户没有记录';

  return (
    <>
      <PageHeader
        title="记账"
        center={range === 'all'
          ? <span className="period-label">全部日期</span>
          : <PeriodSwitcher label={monthLabel(month)} onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)} />}
        right={(
          <>
            <TransactionFilter
              accounts={accounts}
              accountIds={accountFilter}
              onAccountsChange={setAccountFilter}
              range={range}
              onRangeChange={setRange}
              onClear={clearFilters}
            />
            <Button visibleFrom="sm" leftSection={<IconPlus size={18} />} onClick={() => openNew(effectiveView === 'calendar' ? selectedDay : null)}>记一笔</Button>
          </>
        )}
      />
      <div className="page-body">
        <Stack gap="sm">
          <div className="card">
            <Tabs value={effectiveView} onChange={(v) => setView(v || 'daily')}>
              <Tabs.List grow>
                <Tabs.Tab value="daily">每日</Tabs.Tab>
                <Tabs.Tab value="calendar" disabled={range === 'all'}>日历</Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </div>

          {(filteringAccounts || range === 'all') && (
            <div className="filter-bar">
              <Text size="xs" c="dimmed" span>筛选</Text>
              <Group gap={6} style={{ flex: 1, minWidth: 0 }}>
                {range === 'all' && (
                  <Pill withRemoveButton onRemove={() => setRange('month')}>全部日期</Pill>
                )}
                {accountFilter.map((id) => (
                  <Pill key={id} withRemoveButton onRemove={() => setAccountFilter(accountFilter.filter((x) => x !== id))}>
                    {filterLabel(id)}
                  </Pill>
                ))}
              </Group>
              <Button variant="subtle" size="compact-xs" color="gray" onClick={clearFilters}>清除</Button>
            </div>
          )}

          <SummaryBar
            items={[
              { label: range === 'all' ? '总收入' : '收入', value: money(income), className: 'income' },
              { label: range === 'all' ? '总支出' : '支出', value: money(expense), className: 'expense' },
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
                    <b className={a.balance < 0 ? 'expense' : 'income'}>{fmtIn(a.balance, a.currency)}</b>
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <Center py="xl"><Loader color="coral" size="sm" /></Center>
          ) : effectiveView === 'daily' ? (
            groups.length === 0 ? (
              <div className="card empty-state">{emptyText}</div>
            ) : (
              <>
                {shownGroups.map(([date, items], i) => {
                  const m = date.slice(0, 7);
                  const newMonth = range === 'all' && (i === 0 || shownGroups[i - 1][0].slice(0, 7) !== m);
                  return (
                    <Fragment key={date}>
                      {newMonth && <MonthHeader month={m} totals={monthTotals.get(m)} />}
                      <DayGroup date={date} items={items} categories={categories} onSelect={openEdit} />
                    </Fragment>
                  );
                })}
                {shownGroups.length < groups.length && (
                  <Button variant="default" onClick={() => setShownDays((n) => n + DAYS_PER_PAGE)}>
                    显示更多（还有 {groups.length - shownGroups.length} 天的记录）
                  </Button>
                )}
              </>
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
        onClick={() => openNew(effectiveView === 'calendar' ? selectedDay : null)}
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
