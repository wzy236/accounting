import { WEEKDAYS, categoryPath, money, todayStr, weekday } from '../lib/format.js';
import { dayTotals, groupByDate } from '../lib/txGroups.js';

const SOURCE_LABEL = { pdf_import: '导入', recurring: '定时账单', adjustment: '余额调整' };

function TxRow({ t, categories, onSelect }) {
  const isTransfer = t.source === 'transfer';
  const catLabel = isTransfer ? '转账' : categoryPath(categories, t.category_id) || '未分类';
  const meta = [t.account_name, SOURCE_LABEL[t.source]].filter(Boolean).join(' · ');
  const foreign = t.currency && t.currency !== 'CAD';
  return (
    <button type="button" className="tx-row" onClick={() => onSelect(t)}>
      <span className="tx-cat">{catLabel}</span>
      <span className="tx-main">
        <div className="tx-desc">{t.description || catLabel}</div>
        {meta && <div className="tx-account">{meta}</div>}
      </span>
      <span className={`tx-amount ${isTransfer ? 'transfer' : t.type}`}>
        {money(t.amount)}
        {foreign && <div className="tx-original">{Number(t.original_amount).toFixed(2)} {t.currency}</div>}
      </span>
    </button>
  );
}

export function DayGroup({ date, items, categories, onSelect }) {
  const wd = weekday(date);
  const [y, m, d] = date.split('-');
  const { income, expense } = dayTotals(items);
  return (
    <div className="card">
      <div className="day-header">
        <span className="day-num">{Number(d)}</span>
        <span className={`weekday-badge${wd === 6 ? ' sat' : wd === 0 ? ' sun' : ''}`}>
          {date === todayStr() ? '今天' : `周${WEEKDAYS[wd]}`}
        </span>
        <span className="day-ym">{y}.{m}</span>
        <span className="day-totals">
          {income > 0 && <span className="income">{money(income)}</span>}
          {expense > 0 && <span className="expense">{money(expense)}</span>}
        </span>
      </div>
      {items.map((t) => <TxRow key={t.id} t={t} categories={categories} onSelect={onSelect} />)}
    </div>
  );
}

export function SummaryBar({ items }) {
  return (
    <div className="summary-bar">
      {items.map((it) => (
        <div key={it.label} className="summary-item">
          <div className="summary-label">{it.label}</div>
          <div className={`summary-value ${it.className || ''}`}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

const compact = (n) => Math.round(n).toLocaleString('en-CA');

/** 仿 Money Manager 的月历：每个格子显示当天收入（蓝）和支出（红）。 */
export function MonthCalendar({ month, transactions, selectedDay, onSelectDay }) {
  const [y, m] = month.split('-').map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayStr();

  const byDay = new Map(groupByDate(transactions).map(([date, items]) => [date, dayTotals(items)]));
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="card">
      <div className="cal-head">
        {WEEKDAYS.map((w, i) => <div key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : undefined}>{w}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} className="cal-cell blank" />;
          const dateStr = `${month}-${String(d).padStart(2, '0')}`;
          const totals = byDay.get(dateStr);
          const cls = ['cal-cell', dateStr === today && 'today', dateStr === selectedDay && 'selected'].filter(Boolean).join(' ');
          return (
            <button key={dateStr} type="button" className={cls} onClick={() => onSelectDay(dateStr)}>
              <span className="cal-day">{d}</span>
              {totals?.income > 0 && <span className="cal-amt income">{compact(totals.income)}</span>}
              {totals?.expense > 0 && <span className="cal-amt expense">{compact(totals.expense)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
