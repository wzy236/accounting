import { Select } from '@mantine/core';
import { buildCategoryTree } from '../lib/format.js';

export default function CategorySelect({ categories, type, value, onChange, placeholder = '未分类', ...rest }) {
  const list = categories.filter((c) => c.type === type);
  const data = buildCategoryTree(list).map(({ cat, depth }) => {
    const parent = depth ? list.find((c) => c.id === cat.parent_id) : null;
    return { value: String(cat.id), label: parent ? `${parent.name} · ${cat.name}` : cat.name };
  });
  return (
    <Select
      data={data}
      value={value ? String(value) : null}
      onChange={(v) => onChange(v || '')}
      placeholder={placeholder}
      clearable
      searchable
      nothingFoundMessage="没有找到"
      comboboxProps={{ withinPortal: true }}
      {...rest}
    />
  );
}
