// 导入时把 CSV 里写的分类名 / 账户名对应到网站里已有的分类和账户。

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// 分类列里也可以直接写“餐饮 · 咖啡”“餐饮/咖啡”“餐饮 > 咖啡”
const PATH_SEPARATOR = /\s*(?:·|\/|>|›)\s*/;

/**
 * 按名字找分类，返回 { id, missing }：id 是匹配到的分类（找不到为 ''），
 * missing 是没对上的名字（用来提示），全对上为 null。
 * 子分类没找到时先归到大类；只写了子分类名（比如“咖啡”）且只有一个同名子分类时也能对上。
 */
export function matchCategory(categories, type, name, subName = '') {
  let top = String(name ?? '').trim();
  let sub = String(subName ?? '').trim();
  if (!sub && PATH_SEPARATOR.test(top)) [top, sub] = top.split(PATH_SEPARATOR, 2);
  if (!top && !sub) return { id: '', missing: null };

  const list = categories.filter((c) => c.type === type);
  const label = [top, sub].filter(Boolean).join(' · ');
  const uniqueChild = (n) => {
    const found = list.filter((c) => c.parent_id && same(c.name, n));
    return found.length === 1 ? found[0] : null;
  };

  if (!top) {
    const child = uniqueChild(sub);
    return child ? { id: child.id, missing: null } : { id: '', missing: label };
  }
  const parent = list.find((c) => !c.parent_id && same(c.name, top));
  if (!parent) {
    const child = !sub && uniqueChild(top);
    return child ? { id: child.id, missing: null } : { id: '', missing: label };
  }
  if (!sub) return { id: parent.id, missing: null };
  const child = list.find((c) => c.parent_id === parent.id && same(c.name, sub));
  return child ? { id: child.id, missing: null } : { id: parent.id, missing: label };
}

export function matchAccount(accounts, name) {
  const n = String(name ?? '').trim();
  if (!n) return { id: '', missing: null };
  const account = accounts.find((a) => same(a.name, n));
  return account ? { id: account.id, missing: null } : { id: '', missing: n };
}
