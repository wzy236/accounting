import { useCallback, useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { listTransactionsInRange, aggregateByTopCategory, aggregateSubcategories } from '../lib/api.js';
import { defaultMonth, todayStr, fmt } from '../lib/format.js';

ChartJS.register(ArcElement, Tooltip);

const PERIODS = [
  { key: 'year', label: '年' },
  { key: 'month', label: '月' },
  { key: 'day', label: '日' },
];

// 新建分类默认都是同一个颜色，子分类撞色时饼图分不清，撞色的换成调色板里还没用过的颜色
const PALETTE = ['#e07a5f', '#3d5a80', '#f2cc8f', '#81b29a', '#6d597a', '#b56576', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#a8dadc', '#8d99ae'];

function withDistinctColors(items) {
  const used = new Set();
  return items.map((item) => {
    let color = item.color;
    if (used.has(color)) color = PALETTE.find((c) => !used.has(c)) || color;
    used.add(color);
    return { ...item, color };
  });
}

const pad = (n) => String(n).padStart(2, '0');

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** 当前选中的年/月/日对应的查询区间 [start, end)；输入框被清空时返回 null。 */
function periodRange(period, year, month, day) {
  if (period === 'year') return year ? { start: `${year}-01-01`, end: `${Number(year) + 1}-01-01` } : null;
  if (period === 'month') {
    if (!month) return null;
    const [y, m] = month.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
    return { start: `${month}-01`, end: `${next}-01` };
  }
  return day ? { start: day, end: nextDay(day) } : null;
}

function PieBlock({ title, items, drilledName, onDrill, onBack }) {
  const data = withDistinctColors(items);
  const total = data.reduce((s, d) => s + d.total, 0);
  const canDrill = (d) => !drilledName && d?.hasChildren;

  return (
    <section className="chart-card">
      <h2>
        {drilledName ? (
          <>
            <button type="button" className="link-btn crumb" onClick={onBack}>{title}</button>
            <span className="crumb-sep">›</span>{drilledName}
          </>
        ) : title}
        <span className="muted">（合计 {fmt(total)}）</span>
      </h2>

      {data.length === 0 ? (
        <p className="empty">这段时间暂无记录</p>
      ) : (
        <>
          <div className="pie-wrap">
            <Pie
              data={{
                labels: data.map((d) => d.name),
                datasets: [{ data: data.map((d) => d.total), backgroundColor: data.map((d) => d.color) }],
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
                  const d = data[elements[0]?.index];
                  if (canDrill(d)) onDrill(d.id);
                },
                onHover: (evt, elements) => {
                  evt.native.target.style.cursor = canDrill(data[elements[0]?.index]) ? 'pointer' : 'default';
                },
              }}
            />
          </div>

          <ul className="stat-list">
            {data.map((d) => {
              const pct = total ? ((d.total / total) * 100).toFixed(1) : '0.0';
              const row = (
                <>
                  <span className="swatch" style={{ background: d.color }}></span>
                  <span className="stat-name">{d.name}</span>
                  <span className="stat-pct">{pct}%</span>
                  <span className="stat-amount">{fmt(d.total)}</span>
                  <span className="stat-arrow">{canDrill(d) ? '›' : ''}</span>
                </>
              );
              return (
                <li key={d.id}>
                  {canDrill(d)
                    ? <button type="button" className="stat-row clickable" onClick={() => onDrill(d.id)}>{row}</button>
                    : <div className="stat-row">{row}</div>}
                </li>
              );
            })}
          </ul>

          {drilledName ? (
            <button type="button" className="link-btn" onClick={onBack}>← 返回全部分类</button>
          ) : data.some(canDrill) && (
            <p className="hint">点击饼图或带 › 的分类，可以查看里面的子分类</p>
          )}
        </>
      )}
    </section>
  );
}

function CategoryPie({ title, type, transactions, categories }) {
  const [drillId, setDrillId] = useState(null);
  const drilled = drillId ? aggregateSubcategories(transactions, type, drillId, categories) : null;
  const items = drilled ? drilled.items : aggregateByTopCategory(transactions, type, categories);

  return (
    <PieBlock
      title={title}
      items={items}
      drilledName={drilled?.parent?.name}
      onDrill={setDrillId}
      onBack={() => setDrillId(null)}
    />
  );
}

export default function ChartsPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, ready } = useData();

  const thisYear = new Date().getFullYear();
  const [period, setPeriod] = useState('month');
  const [year, setYear] = useState(String(thisYear));
  const [month, setMonth] = useState(defaultMonth());
  const [day, setDay] = useState(todayStr());
  const [transactions, setTransactions] = useState([]);

  const range = periodRange(period, year, month, day);
  const start = range?.start;
  const end = range?.end;

  const reload = useCallback(async () => {
    if (!start) return;
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

  const years = Array.from({ length: 11 }, (_, i) => String(thisYear + 1 - i));

  return (
    <section>
      <div className="page-header">
        <h1>📊 统计图表</h1>
        <div className="period-controls">
          <div className="segmented" role="tablist">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={period === p.key}
                className={period === p.key ? 'active' : undefined}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === 'year' && (
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y} 年</option>)}
            </select>
          )}
          {period === 'month' && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}
          {period === 'day' && <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />}
        </div>
      </div>
      <div className="chart-columns">
        <CategoryPie title="支出分布" type="expense" transactions={transactions} categories={categories} />
        <CategoryPie title="收入分布" type="income" transactions={transactions} categories={categories} />
      </div>
    </section>
  );
}
