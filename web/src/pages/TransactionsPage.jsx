import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionIcon, Button, Loader, Center, Pill, Group, Stack, Tabs, Text } from '@mantine/core';
import { IconListCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { deleteTransactions, listTransactionsForMonth, listTransactionsInRange } from '../lib/api.js';
import { confirmAction } from '../lib/confirm.jsx';
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
  const [selecting, setSelecting] = useState(false); // 多选模式
  const [selectedIds, setSelectedIds] = useState(() => new Set());

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

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setManySelected(ids, on) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function exitSelecting() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  /** 删除一条（滑动删除）或多条（多选），先确认；转账只删选中的这一侧，跟编辑里删除的规则一样。 */
  async function deleteRecords(list) {
    const transfers = list.filter((t) => t.source === 'transfer').length;
    const ok = await confirmAction({
      title: list.length === 1 ? '删除记录' : `删除 ${list.length} 笔记录`,
      message: [
        list.length === 1 ? `确认删除「${list[0].description || '这条记录'}」？` : `确认删除选中的 ${list.length} 笔记录？`,
        transfers ? `其中 ${transfers} 笔是转账的一侧，另一侧账户的记录不会自动删除。` : '',
        '删除后不能恢复。',
      ].join(''),
      confirmLabel: '删除',
    });
    if (!ok) return;
    try {
      await deleteTransactions(client, list.map((t) => t.id));
      showToast(list.length === 1 ? '已删除' : `已删除 ${list.length} 笔记录`);
      exitSelecting();
      handleSaved();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
      handleSaved();
    }
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
  // 多选只作用于当前列表里看得见的记录；换月份/筛选后看不见的不会被删
  const displayed = effectiveView === 'daily' ? shownGroups.flatMap(([, items]) => items) : selectedItems;
  const chosen = displayed.filter((t) => selectedIds.has(t.id));
  const allChosen = displayed.length > 0 && chosen.length === displayed.length;
  const listProps = selecting
    ? { selecting: true, selectedIds, onToggle: toggleSelected, onToggleMany: setManySelected }
    : { onSelect: openEdit, onDelete: (t) => deleteRecords([t]) };

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
        right={selecting ? (
          <Button variant="subtle" color="gray" onClick={exitSelecting}>取消</Button>
        ) : (
          <>
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => setSelecting(true)} aria-label="多选">
              <IconListCheck size={20} />
            </ActionIcon>
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
                      <DayGroup date={date} items={items} categories={categories} {...listProps} />
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
                <DayGroup date={selectedDay} items={selectedItems} categories={categories} {...listProps} />
              ) : (
                <div className="card empty-state">
                  <Text size="sm" c="dimmed" mb="xs">这天没有记录</Text>
                  <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => openNew(selectedDay)}>记一笔</Button>
                </div>
              ))}
            </>
          )}

          {selecting && (
            <div className="sticky-actions select-bar">
              <Text size="sm" fw={600} className="select-count">已选 {chosen.length} 笔</Text>
              <Button variant="default" size="sm" disabled={displayed.length === 0} onClick={() => setManySelected(displayed.map((t) => t.id), !allChosen)}>
                {allChosen ? '全不选' : '全选'}
              </Button>
              <Button color="red" size="sm" leftSection={<IconTrash size={16} />} disabled={chosen.length === 0} onClick={() => deleteRecords(chosen)}>
                删除
              </Button>
            </div>
          )}
        </Stack>
      </div>

      {!selecting && <ActionIcon
        className="fab"
        size={56}
        radius="xl"
        aria-label="记一笔"
        onClick={() => openNew(effectiveView === 'calendar' ? selectedDay : null)}
      >
        <IconPlus size={28} />
      </ActionIcon>}

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
