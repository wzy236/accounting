import { useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { aggregateByTopCategory, aggregateSubcategories } from '../lib/api.js';
import { fmt, money } from '../lib/format.js';

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

/**
 * 按分类的饼图 + 带百分比的列表；点有子分类的大类可以展开看子分类。
 * transactions 只要有 type / amount / category_id / source 这几个字段就行（定时账单页也拿它来画固定收支的占比）。
 */
export default function CategoryBreakdown({ type, transactions, categories, emptyText }) {
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
        <div className="empty-state">{emptyText || `这段时间暂无${type === 'income' ? '收入' : '支出'}记录`}</div>
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
