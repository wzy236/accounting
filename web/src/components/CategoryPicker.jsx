import { useState } from 'react';
import { Button, Group, Select, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { useToast } from '../lib/toast.js';
import { createCategory } from '../lib/api.js';
import { SWATCHES } from '../lib/colors.js';

const byName = (a, b) => a.name.localeCompare(b.name);
const TOP = 'top'; // 新分类作为大类

/**
 * 仿 Money Manager 的分类选择：顶级分类排成格子，选中一个有子分类的大类后，下面再出一排子分类。
 * value 为空字符串表示未分类。最后的「＋ 新分类」可以就地新建分类（大类或某个大类下的子分类），建好直接选上。
 */
export default function CategoryPicker({ categories, type, value, onChange }) {
  const { client } = useSupabase();
  const { refreshCategories } = useData();
  const showToast = useToast();
  const [creating, setCreating] = useState(null); // null，或者 { name, parentId }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const list = categories.filter((c) => c.type === type);
  const tops = list.filter((c) => !c.parent_id).sort(byName);
  const selected = list.find((c) => c.id === value);
  const activeTopId = selected ? (selected.parent_id || selected.id) : null;
  const children = activeTopId ? list.filter((c) => c.parent_id === activeTopId).sort(byName) : [];
  const modeClass = type === 'income' ? ' income-mode' : '';

  function startCreate(parentId) {
    setCreating({ name: '', parentId });
    setError('');
  }

  async function create() {
    const name = creating.name.trim();
    if (!name) {
      setError('请输入分类名称');
      return;
    }
    // 同类型下分类名不能重复（数据库有唯一约束），已经有了就直接选上
    const existing = list.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      onChange(existing.id);
      setCreating(null);
      showToast(`已经有「${existing.name}」了，已帮你选上`);
      return;
    }
    const parent = creating.parentId === TOP ? null : tops.find((c) => c.id === creating.parentId);
    // 子分类沿用大类的颜色；大类挑一个同类型大类还没用过的颜色
    const color = parent?.color || SWATCHES.find((c) => !tops.some((t) => t.color?.toLowerCase() === c)) || SWATCHES[0];
    setSaving(true);
    try {
      const [created] = await createCategory(client, { name, type, color, parent_id: parent?.id || null });
      await refreshCategories();
      onChange(created.id); // 新分类直接选上，不再另外弹提示
      setCreating(null);
    } catch (err) {
      setError(err.message?.includes('duplicate') ? '同类型下已经有叫这个名字的分类了' : `添加失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const chip = (key, label, active, onClick, color) => (
    <button key={key} type="button" className={`cat-chip${active ? ' active' : ''}${modeClass}`} onClick={onClick}>
      {color && <span className="dot" style={{ background: color }} />}
      <span>{label}</span>
    </button>
  );
  const addChip = (key, label, parentId) => (
    <button key={key} type="button" className="cat-chip add" onClick={() => startCreate(parentId)}>
      <IconPlus size={14} />
      <span>{label}</span>
    </button>
  );

  return (
    <div>
      <div className="cat-grid">
        {chip('none', '未分类', !value, () => onChange(''))}
        {tops.map((c) => chip(c.id, c.name, activeTopId === c.id, () => onChange(c.id), c.color))}
        {addChip('add', '新分类', TOP)}
      </div>
      {children.length > 0 && (
        <div className="sub-chips">
          {chip('parent', '不细分', value === activeTopId, () => onChange(activeTopId))}
          {children.map((c) => chip(c.id, c.name, value === c.id, () => onChange(c.id)))}
          {addChip('add-sub', '子分类', activeTopId)}
        </div>
      )}
      {creating && (
        <div className="cat-new">
          <TextInput
            size="sm"
            placeholder="新分类名称"
            aria-label="新分类名称"
            autoFocus
            value={creating.name}
            onChange={(e) => setCreating({ ...creating, name: e.currentTarget.value })}
            onKeyDown={(e) => {
              // 抽屉本身是个表单，回车不能把整笔记录提交了
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!saving) create();
              }
            }}
            error={error || undefined}
          />
          <Select
            size="sm"
            aria-label="上级分类"
            allowDeselect={false}
            data={[{ value: TOP, label: '作为大类' }, ...tops.map((c) => ({ value: c.id, label: `放在「${c.name}」下` }))]}
            value={creating.parentId}
            onChange={(v) => setCreating({ ...creating, parentId: v || TOP })}
            comboboxProps={{ withinPortal: true }}
          />
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed">建好后直接选上，也会出现在「分类管理」里</Text>
            <Group gap="xs" wrap="nowrap">
              <Button variant="default" size="xs" onClick={() => setCreating(null)}>取消</Button>
              <Button size="xs" loading={saving} onClick={create}>添加</Button>
            </Group>
          </Group>
        </div>
      )}
    </div>
  );
}
