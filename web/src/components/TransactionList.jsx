import { useEffect, useRef, useState } from 'react';
import { CheckboxIndicator } from '@mantine/core';
import { WEEKDAYS, categoryPath, money, todayStr, weekday } from '../lib/format.js';
import { dayTotals, groupByDate } from '../lib/txGroups.js';

const SOURCE_LABEL = { pdf_import: '导入', recurring: '定时账单' };

// 滑动删除：按钮宽度，以及“有一行滑开了”的广播事件（同时只留一行滑开）
const ACTION_W = 80;
const SWIPE_OPEN_EVENT = 'tx-swipe-open';

/** 左右滑都能露出底下的「删除」；点删除交给 onDelete（里面会先确认）。点行本身还是打开编辑。 */
function SwipeRow({ id, onOpen, onDelete, children }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const close = (e) => { if (e.detail !== id) setOffset(0); };
    window.addEventListener(SWIPE_OPEN_EVENT, close);
    return () => window.removeEventListener(SWIPE_OPEN_EVENT, close);
  }, [id]);

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, start: offset, mode: 'pending', pointerId: e.pointerId };
    window.dispatchEvent(new CustomEvent(SWIPE_OPEN_EVENT, { detail: id }));
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === 'pending') {
      // 横向为主才算滑动；竖着动就交给页面滚动
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        d.mode = 'swipe';
        setDragging(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } else if (Math.abs(dy) > 8) {
        d.mode = 'scroll';
      }
    }
    if (d.mode === 'swipe') setOffset(Math.max(-ACTION_W * 1.25, Math.min(ACTION_W * 1.25, d.start + dx)));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.mode !== 'swipe') return;
    // 鼠标拖完会紧跟一个 click，别让它打开编辑
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    setDragging(false);
    setOffset((o) => (o > ACTION_W / 2 ? ACTION_W : o < -ACTION_W / 2 ? -ACTION_W : 0));
  }
  function onClick() {
    if (suppressClick.current) return;
    if (offset !== 0) setOffset(0);
    else onOpen();
  }
  async function handleDelete() {
    await onDelete();
    setOffset(0);
  }

  return (
    <div className="tx-swipe">
      <div className="tx-swipe-actions" aria-hidden={offset === 0}>
        <button type="button" className="tx-swipe-delete" tabIndex={offset > 0 ? 0 : -1} onClick={handleDelete}>删除</button>
        <button type="button" className="tx-swipe-delete" tabIndex={offset < 0 ? 0 : -1} onClick={handleDelete}>删除</button>
      </div>
      <button
        type="button"
        className="tx-row"
        style={{ transform: offset ? `translateX(${offset}px)` : undefined, transition: dragging ? 'none' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        {children}
      </button>
    </div>
  );
}

/**
 * 一条记录。selecting 时点击是勾选/取消勾选；传了 onDelete 时可以左右滑出删除。
 */
function TxRow({ t, categories, onSelect, selecting, checked, onToggle, onDelete }) {
  const isTransfer = t.source === 'transfer';
  const isAdjustment = t.source === 'adjustment';
  const catLabel = isTransfer ? '转账' : isAdjustment ? '余额调整' : categoryPath(categories, t.category_id) || '未分类';
  const meta = [t.account_name, SOURCE_LABEL[t.source]].filter(Boolean).join(' · ');
  const foreign = t.currency && t.currency !== 'CAD';
  const content = (
    <>
      <span className="tx-cat">{catLabel}</span>
      <span className="tx-main">
        <div className="tx-desc">{t.description || catLabel}</div>
        {meta && <div className="tx-account">{meta}</div>}
      </span>
      {/* 转账、余额调整不算收支，金额用灰色；余额调整单独一条，标出是加还是减 */}
      <span className={`tx-amount ${isTransfer || isAdjustment ? 'transfer' : t.type}`}>
        {isAdjustment && (t.type === 'income' ? '+' : '−')}{money(t.amount)}
        {foreign && <div className="tx-original">{Number(t.original_amount).toFixed(2)} {t.currency}</div>}
      </span>
    </>
  );
  if (selecting) {
    return (
      <button type="button" role="checkbox" aria-checked={checked} className={`tx-row selecting${checked ? ' checked' : ''}`} onClick={() => onToggle(t.id)}>
        <CheckboxIndicator checked={checked} size="sm" />
        {content}
      </button>
    );
  }
  if (onDelete) {
    return <SwipeRow id={t.id} onOpen={() => onSelect(t)} onDelete={() => onDelete(t)}>{content}</SwipeRow>;
  }
  return <button type="button" className="tx-row" onClick={() => onSelect(t)}>{content}</button>;
}

export function DayGroup({ date, items, categories, onSelect, onDelete, selecting, selectedIds, onToggle, onToggleMany }) {
  const wd = weekday(date);
  const [y, m, d] = date.split('-');
  const { income, expense } = dayTotals(items);
  const checkedCount = selecting ? items.filter((t) => selectedIds.has(t.id)).length : 0;
  const allChecked = selecting && checkedCount === items.length;
  return (
    <div className="card">
      <div className="day-header">
        {selecting && (
          <button
            type="button"
            className="day-select"
            role="checkbox"
            aria-checked={allChecked ? true : checkedCount > 0 ? 'mixed' : false}
            aria-label={`选择 ${Number(m)}月${Number(d)}日 的全部记录`}
            onClick={() => onToggleMany(items.map((t) => t.id), !allChecked)}
          >
            <CheckboxIndicator checked={allChecked} indeterminate={checkedCount > 0 && !allChecked} size="sm" />
          </button>
        )}
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
      {items.map((t) => (
        <TxRow
          key={t.id}
          t={t}
          categories={categories}
          onSelect={onSelect}
          onDelete={onDelete}
          selecting={selecting}
          checked={selecting && selectedIds.has(t.id)}
          onToggle={onToggle}
        />
      ))}
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
