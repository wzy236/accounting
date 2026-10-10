import { useCallback, useEffect, useState } from 'react';
import { SegmentedControl, Stack, Tabs } from '@mantine/core';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { listTransactionsInRange } from '../lib/api.js';
import {
  defaultMonth, todayStr, money, monthLabel, shiftMonth, shiftDay, WEEKDAYS, weekday,
} from '../lib/format.js';
import PageHeader, { PeriodSwitcher } from '../components/PageHeader.jsx';
import CategoryBreakdown from '../components/CategoryBreakdown.jsx';
import { dayTotals } from '../lib/txGroups.js';

/** 当前选中的年/月/日对应的查询区间 [start, end)。 */
function periodRange(period, anchor) {
  if (period === 'year') return { start: `${anchor.year}-01-01`, end: `${anchor.year + 1}-01-01` };
  if (period === 'month') return { start: `${anchor.month}-01`, end: `${shiftMonth(anchor.month, 1)}-01` };
  return { start: anchor.day, end: shiftDay(anchor.day, 1) };
}

function periodLabel(period, anchor) {
  if (period === 'year') return `${anchor.year}年`;
  if (period === 'month') return monthLabel(anchor.month);
  const [, m, d] = anchor.day.split('-').map(Number);
  return `${m}月${d}日 周${WEEKDAYS[weekday(anchor.day)]}`;
}

function shiftAnchor(period, anchor, delta) {
  if (period === 'year') return { ...anchor, year: anchor.year + delta };
  if (period === 'month') return { ...anchor, month: shiftMonth(anchor.month, delta) };
  return { ...anchor, day: shiftDay(anchor.day, delta) };
}

export default function ChartsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, ready } = useData();

  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(() => ({ year: new Date().getFullYear(), month: defaultMonth(), day: todayStr() }));
  const [type, setType] = useState('expense');
  const [transactions, setTransactions] = useState([]);

  const { start, end } = periodRange(period, anchor);

  const reload = useCallback(async () => {
    try {
      setTransactions(await listTransactionsInRange(client, start, end));
    } catch (e) {
      showToast('加载数据失败：' + e.message, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, start, end]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const { income, expense } = dayTotals(transactions);

  return (
    <>
      <PageHeader
        title="统计"
        center={(
          <PeriodSwitcher
            label={periodLabel(period, anchor)}
            onPrev={() => setAnchor((a) => shiftAnchor(period, a, -1))}
            onNext={() => setAnchor((a) => shiftAnchor(period, a, 1))}
          />
        )}
        right={(
          <SegmentedControl
            size="xs"
            data={[{ label: '年', value: 'year' }, { label: '月', value: 'month' }, { label: '日', value: 'day' }]}
            value={period}
            onChange={setPeriod}
          />
        )}
      />
      <div className="page-body">
        <Stack gap="sm">
          <div className="card">
            <Tabs value={type} onChange={(v) => setType(v || 'expense')} color={type === 'income' ? 'blue' : 'coral'}>
              <Tabs.List grow>
                <Tabs.Tab value="income">收入 <span className="income">{money(income)}</span></Tabs.Tab>
                <Tabs.Tab value="expense">支出 <span className="expense">{money(expense)}</span></Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </div>
          <CategoryBreakdown key={type} type={type} transactions={transactions} categories={categories} />
        </Stack>
      </div>
    </>
  );
}
