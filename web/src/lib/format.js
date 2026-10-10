export function defaultMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 本位货币是 CAD；传进来的 n 已经是换算成 CAD 之后的金额。
export function fmt(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}CA$${abs}`;
}

export function balanceClass(n) {
  return n > 0 ? 'positive' : n < 0 ? 'negative' : '';
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
