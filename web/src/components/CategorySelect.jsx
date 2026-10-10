import { TreeSelect } from '@mantine/core';
import { IconCheck, IconChevronRight } from '@tabler/icons-react';

const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * 分类下拉：只列一级分类，有子分类的大类点左边的箭头展开；点大类名字本身就是直接选大类（不细分）。
 * 子分类的 label 带上父分类（“餐饮 · 午饭”），这样选中后输入框里能看出属于哪个大类，搜索也能按父分类搜；
 * 下拉树里只显示子分类自己的名字。用了 renderNode 之后 Mantine 不再画默认的展开箭头，所以这里自己画。
 */
export default function CategorySelect({ categories, type, value, onChange, placeholder = '未分类', ...rest }) {
  const list = categories.filter((c) => c.type === type);
  const data = list.filter((c) => !c.parent_id).sort(byName).map((top) => {
    const children = list.filter((c) => c.parent_id === top.id).sort(byName).map((c) => ({
      value: String(c.id),
      label: `${top.name} · ${c.name}`,
      nodeProps: { 'data-short': c.name },
    }));
    return children.length ? { value: String(top.id), label: top.name, children } : { value: String(top.id), label: top.name };
  });

  const selected = list.find((c) => String(c.id) === String(value));
  const expanded = selected?.parent_id ? [String(selected.parent_id)] : [];

  return (
    <TreeSelect
      data={data}
      value={value ? String(value) : null}
      onChange={(v) => onChange(v || '')}
      placeholder={placeholder}
      clearable
      searchable
      nothingFoundMessage="没有找到"
      defaultExpandedValues={expanded}
      maxDropdownHeight={280}
      renderNode={({ node, hasChildren, expanded: isOpen, selected, expand }) => (
        <span className="tree-node">
          {hasChildren ? (
            <span
              role="button"
              tabIndex={-1}
              className={`tree-chevron${isOpen ? ' open' : ''}`}
              aria-label={`${isOpen ? '收起' : '展开'}「${node.label}」的子分类`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={expand}
            >
              <IconChevronRight size={14} />
            </span>
          ) : (
            <span className="tree-chevron-spacer" />
          )}
          <span className="tree-node-label">{node.nodeProps?.['data-short'] ?? node.label}</span>
          {selected && <IconCheck size={14} className="tree-check" />}
        </span>
      )}
      comboboxProps={{ withinPortal: true }}
      {...rest}
    />
  );
}
