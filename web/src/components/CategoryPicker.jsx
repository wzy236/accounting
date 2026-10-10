const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * 仿 Money Manager 的分类选择：顶级分类排成格子，选中一个有子分类的大类后，下面再出一排子分类。
 * value 为空字符串表示未分类。
 */
export default function CategoryPicker({ categories, type, value, onChange }) {
  const list = categories.filter((c) => c.type === type);
  const tops = list.filter((c) => !c.parent_id).sort(byName);
  const selected = list.find((c) => c.id === value);
  const activeTopId = selected ? (selected.parent_id || selected.id) : null;
  const children = activeTopId ? list.filter((c) => c.parent_id === activeTopId).sort(byName) : [];
  const modeClass = type === 'income' ? ' income-mode' : '';

  const chip = (key, label, active, onClick, color) => (
    <button key={key} type="button" className={`cat-chip${active ? ' active' : ''}${modeClass}`} onClick={onClick}>
      {color && <span className="dot" style={{ background: color }} />}
      <span>{label}</span>
    </button>
  );

  return (
    <div>
      <div className="cat-grid">
        {chip('none', '未分类', !value, () => onChange(''))}
        {tops.map((c) => chip(c.id, c.name, activeTopId === c.id, () => onChange(c.id), c.color))}
      </div>
      {children.length > 0 && (
        <div className="sub-chips">
          {chip('parent', '不细分', value === activeTopId, () => onChange(activeTopId))}
          {children.map((c) => chip(c.id, c.name, value === c.id, () => onChange(c.id)))}
        </div>
      )}
    </div>
  );
}
