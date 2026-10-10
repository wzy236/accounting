import { useCallback, useEffect, useState } from 'react';
import { SegmentedControl, Stack, Tabs } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { listTransactionsInRange, aggregateByTopCategory, aggregateSubcategories } from '../lib/api.js';
import {
  defaultMonth, todayStr, fmt, money, monthLabel, shiftMonth, shiftDay, WEEKDAYS, weekday,
} from '../lib/format.js';
import PageHeader, { PeriodSwitcher } from '../components/PageHeader.jsx';
import { dayTotals } from '../lib/txGroups.js';

ChartJS.register(ArcElement, Tooltip);

// 新建分类默认都是同一个颜色，子分类撞色时饼图分不清，撞色的换成调色板里还没用过的颜色
const PALETTE = ['#f25a5a', '#f59f45', '#f2c94c', '#6fcf97', '#2f9e8f', '#2f7ee6', '#5b6ee8', '#9b6bd8', '#e86fa8', '#8d99ae', '#b5835a', '#4fb3d9'];

function withDistinctColors(items) {
  const used = new Set();
  return items.map((item) => {
    let color = item.color;
    if (used.has(color)) color = PALETTE.find((c) => !used.has(c)) || color;
    used.add(color);
    return { ...item, color };
  });
}

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

function CategoryBreakdown({ type, transactions, categories }) {
  const [drillId, setDrillId] = useState(null);
  const drilled = drillId ? aggregateSubcategories(transactions, type, drillId, categories) : null;
  const items = withDistinctColors(drilled ? drilled.items : aggregateByTopCategory(transactions, type, categories));
  const total = items.reduce((s, d) => s + d.total, 0);
  const canDrill = (d) => !drilled && d?.hasChildren;

  return (
    <div className="card">
      {drilled && (
        <button type="button" className="list-row" onClick={() => setDrillId(null)}>
          <IconChevronLeft size={18} />
          <span className="list-row-main"><b>{drilled.parent?.name}</b> <span className="muted">· 子分类</span></span>
          <b className={type}>{money(total)}</b>
        </button>
      )}

      {items.length === 0 ? (
        <div className="empty-state">这段时间暂无{type === 'income' ? '收入' : '支出'}记录</div>
      ) : (
        <>
          <div className="pie-wrap">
            <Pie
              data={{
                labels: items.map((d) => d.name),
                datasets: [{ data: items.map((d) => d.total), backgroundColor: items.map((d) => d.color), borderWidth: 2 }],
              }}
              options={{
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label(ctx) {
                        const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
                        return `${ctx.label}: ${fmt(ctx.parsed)} (${pct}%)`;
                      },
                    },
                  },
                },
                onClick: (_evt, elements) => {
                  const d = items[elements[0]?.index];
                  if (canDrill(d)) setDrillId(d.id);
                },
                onHover: (evt, elements) => {
                  evt.native.target.style.cursor = canDrill(items[elements[0]?.index]) ? 'pointer' : 'default';
                },
              }}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--mm-border)' }}>
            {items.map((d) => {
              const pct = total ? Math.round((d.total / total) * 100) : 0;
              const content = (
                <>
                  <span className="pct-badge" style={{ background: d.color }}>{pct}%</span>
                  <span className="list-row-main">{d.name}</span>
                  <span>{money(d.total)}</span>
                  {canDrill(d) && <IconChevronRight size={16} color="var(--mantine-color-gray-5)" />}
                </>
              );
              return canDrill(d) ? (
                <button key={d.id} type="button" className="list-row" onClick={() => setDrillId(d.id)}>{content}</button>
              ) : (
                <div key={d.id} className="list-row">{content}</div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
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
