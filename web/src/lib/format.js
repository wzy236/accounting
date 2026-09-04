export function defaultMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmt(n) {
  return '¥' + Number(n || 0).toFixed(2);
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
