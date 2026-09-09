import { buildCategoryTree } from '../lib/format.js';

export default function CategorySelect({ categories, type, value, onChange, className }) {
  const opts = buildCategoryTree(categories.filter((c) => c.type === type));
  return (
    <select className={className} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">未分类</option>
      {opts.map(({ cat, depth }) => (
        <option key={cat.id} value={cat.id}>{depth ? '　' : ''}{cat.name}</option>
      ))}
    </select>
  );
}
