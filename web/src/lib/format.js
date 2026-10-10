const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function defaultMonth() {
  return todayStr().slice(0, 7);
}

export function todayStr() {
  return toDateStr(new Date());
}

export function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function shiftDay(dateStr, delta) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}

export function monthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return `${y}年${m}月`;
}

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function weekday(dateStr) {
  return parseDateStr(dateStr).getDay();
}

export function dayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}年${m}月${d}日 周${WEEKDAYS[weekday(dateStr)]}`;
}

// 本位货币是 CAD；传进来的 n 已经是换算成 CAD 之后的金额。
export function fmt(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  return `${sign}CA$${money(Math.abs(num))}`;
}

/** 不带货币符号的金额，用在列表这种密集的地方。 */
export function money(n) {
  return (Number(n) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 把一组分类按“顶级分类 -> 紧跟它的子分类”的顺序展开，用于下拉菜单和列表展示。 */
export function buildCategoryTree(list) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const roots = list.filter((c) => !c.parent_id).sort(byName);
  const result = [];
  roots.forEach((root) => {
    result.push({ cat: root, depth: 0 });
    list.filter((c) => c.parent_id === root.id).sort(byName)
      .forEach((child) => result.push({ cat: child, depth: 1 }));
  });
  return result;
}

/** “餐饮 · 午饭”这种带父分类的完整名字；找不到分类返回 null。 */
export function categoryPath(categories, id) {
  const cat = categories.find((c) => c.id === id);
  if (!cat) return null;
  const parent = cat.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
  return parent ? `${parent.name} · ${cat.name}` : cat.name;
}
