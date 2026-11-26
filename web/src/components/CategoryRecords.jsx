import { IconChevronLeft } from '@tabler/icons-react';
import { money } from '../lib/format.js';
import { countsAsIncomeExpense, groupByDate } from '../lib/txGroups.js';
import { DayGroup } from './TransactionList.jsx';

/**
 * 统计页里点开某个分类后，按天列出这个分类在所选时间内的每一笔记录。
 * detail.ids 里是要列出的分类 id；分类不存在（没选分类或分类已删）的记录算 'none'，和饼图里的「未分类」一致。
 */
export default function CategoryRecords({ detail, type, transactions, categories, onBack, onSelect }) {
  const known = new Set(categories.map((c) => c.id));
  const items = transactions.filter((t) => t.type === type && countsAsIncomeExpense(t)
    && detail.ids.includes(known.has(t.category_id) ? t.category_id : 'none'));
  const total = items.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <>
      <div className="card">
        <button type="button" className="list-row" onClick={onBack}>
          <IconChevronLeft size={18} />
          <span className="list-row-main"><b>{detail.name}</b> <span className="muted">· {items.length} 笔</span></span>
          <b className={type}>{money(total)}</b>
        </button>
      </div>
      {items.length === 0 ? (
        <div className="card"><div className="empty-state">这段时间没有这个分类的记录</div></div>
      ) : (
        groupByDate(items).map(([date, list]) => (
          <DayGroup key={date} date={date} items={list} categories={categories} onSelect={onSelect} />
        ))
      )}
    </>
  );
}
