import { useState } from 'react';
import { Button, Group, Select, Text, TextInput } from '@mantine/core';
import { IconCheck, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { useToast } from '../lib/toast.js';
import { confirmAction } from '../lib/confirm.jsx';
import { categoryErrorMessage, createCategory, deleteCategory, updateCategory } from '../lib/api.js';
import { SWATCHES } from '../lib/colors.js';

const byName = (a, b) => a.name.localeCompare(b.name);
const TOP = 'top'; // 新分类作为大类

/** 同一个上级下（都是大类也算）有没有同名的分类；不同大类下的子分类可以同名。 */
const findSameName = (list, name, parentId, exceptId) => list.find((c) => c.id !== exceptId
  && (c.parent_id || null) === (parentId || null)
  && c.name.trim().toLowerCase() === name.toLowerCase());

/**
 * 仿 Money Manager 的分类选择：顶级分类排成格子，选中一个有子分类的大类后，下面再出一排子分类。
 * value 为空字符串表示未分类。
 * 「＋ 新分类」/「＋ 子分类」可以就地新建分类，建好直接选上；
 * 「编辑」进入编辑模式，点分类就是改名或删除（点大类同时展开它的子分类）。
 */
export default function CategoryPicker({ categories, type, value, onChange }) {
  const { client } = useSupabase();
  const { refreshCategories } = useData();
  const showToast = useToast();
  const [creating, setCreating] = useState(null); // null，或者 { name, parentId }
  const [editing, setEditing] = useState(false);
  const [browseTopId, setBrowseTopId] = useState(null); // 编辑模式下展开的大类
  const [target, setTarget] = useState(null); // 正在改的分类：{ cat, name }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const list = categories.filter((c) => c.type === type);
  const tops = list.filter((c) => !c.parent_id).sort(byName);
  const selected = list.find((c) => c.id === value);
  const selectedTopId = selected ? (selected.parent_id || selected.id) : null;
  const activeTopId = editing ? browseTopId : selectedTopId;
  const children = activeTopId ? list.filter((c) => c.parent_id === activeTopId).sort(byName) : [];
  const modeClass = type === 'income' ? ' income-mode' : '';

  function startCreate(parentId) {
    setCreating({ name: '', parentId });
    setError('');
  }

  function toggleEditing() {
    setEditing(!editing);
    setBrowseTopId(selectedTopId);
    setTarget(null);
    setCreating(null);
    setError('');
  }

  function startEdit(cat) {
    if (!cat.parent_id) setBrowseTopId(cat.id);
    setTarget({ cat, name: cat.name });
    setError('');
  }

  async function create() {
    const name = creating.name.trim();
    if (!name) {
      setError('请输入分类名称');
      return;
    }
    const parent = creating.parentId === TOP ? null : tops.find((c) => c.id === creating.parentId);
    // 同一个上级下已经有同名的，就直接选上
    const existing = findSameName(list, name, parent?.id);
    if (existing) {
      onChange(existing.id);
      setCreating(null);
      showToast(`已经有「${existing.name}」了，已帮你选上`);
      return;
    }
    // 子分类沿用大类的颜色；大类挑一个同类型大类还没用过的颜色
    const color = parent?.color || SWATCHES.find((c) => !tops.some((t) => t.color?.toLowerCase() === c)) || SWATCHES[0];
    setSaving(true);
    try {
      const [created] = await createCategory(client, { name, type, color, parent_id: parent?.id || null });
      await refreshCategories();
      onChange(created.id); // 新分类直接选上，不再另外弹提示
      setCreating(null);
    } catch (err) {
      setError(categoryErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function rename() {
    const { cat } = target;
    const name = target.name.trim();
    if (!name) {
      setError('请输入分类名称');
      return;
    }
    if (name === cat.name) {
      setTarget(null);
      return;
    }
    if (findSameName(list, name, cat.parent_id, cat.id)) {
      setError('这个大类下已经有叫这个名字的分类了');
      return;
    }
    setSaving(true);
    try {
      await updateCategory(client, cat.id, { name });
      await refreshCategories();
      setTarget(null);
      showToast(`已改名为「${name}」`);
    } catch (err) {
      setError(categoryErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const { cat } = target;
    const childIds = list.filter((c) => c.parent_id === cat.id).map((c) => c.id);
    const ok = await confirmAction({
      title: `删除「${cat.name}」`,
      message: childIds.length
        ? `它下面的 ${childIds.length} 个子分类会一起删除，用到这些分类的记录都会变为未分类，确认删除？`
        : '用到这个分类的记录会变为未分类，确认删除？',
      confirmLabel: '删除',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteCategory(client, cat.id);
      await refreshCategories();
      if ([cat.id, ...childIds].includes(value)) onChange(''); // 当前选中的被删了，就回到未分类
      if (browseTopId === cat.id) setBrowseTopId(null);
      setTarget(null);
      showToast(`已删除「${cat.name}」`);
    } catch (err) {
      setError(`删除失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const chip = (key, label, active, onClick, color, editable) => (
    <button key={key} type="button" className={`cat-chip${active ? ' active' : ''}${modeClass}`} onClick={onClick}>
      {color && <span className="dot" style={{ background: color }} />}
      <span>{label}</span>
      {editable && <IconPencil size={12} className="cat-chip-edit" />}
    </button>
  );
  const catChip = (c, label = c.name) => (editing
    ? chip(c.id, label, target?.cat.id === c.id || (!c.parent_id && browseTopId === c.id), () => startEdit(c), c.parent_id ? null : c.color, true)
    : chip(c.id, label, c.parent_id ? value === c.id : activeTopId === c.id, () => onChange(c.id), c.parent_id ? null : c.color));
  const addChip = (key, label, parentId) => (
    <button key={key} type="button" className="cat-chip add" onClick={() => startCreate(parentId)}>
      <IconPlus size={14} />
      <span>{label}</span>
    </button>
  );
  const keepFormOpen = (e) => {
    // 抽屉本身是个表单，回车不能把整笔记录提交了
    if (e.key === 'Enter') e.preventDefault();
  };

  return (
    <div>
      <div className="cat-grid">
        {!editing && chip('none', '未分类', !value, () => onChange(''))}
        {tops.map((c) => catChip(c))}
        {!editing && addChip('add', '新分类', TOP)}
        {list.length > 0 && (
          <button type="button" className={`cat-chip add${editing ? ' editing' : ''}`} onClick={toggleEditing}>
            {editing ? <IconCheck size={14} /> : <IconPencil size={14} />}
            <span>{editing ? '完成' : '编辑'}</span>
          </button>
        )}
      </div>
      {editing && <Text size="xs" c="dimmed" mt={6}>点一个分类可以改名或删除；点大类会展开它的子分类</Text>}
      {children.length > 0 && (
        <div className="sub-chips">
          {!editing && chip('parent', '不细分', value === activeTopId, () => onChange(activeTopId))}
          {children.map((c) => catChip(c))}
          {!editing && addChip('add-sub', '子分类', activeTopId)}
        </div>
      )}

      {creating && !editing && (
        <div className="cat-new">
          <TextInput
            size="sm"
            placeholder="新分类名称"
            aria-label="新分类名称"
            autoFocus
            value={creating.name}
            onChange={(e) => setCreating({ ...creating, name: e.currentTarget.value })}
            onKeyDown={(e) => {
              keepFormOpen(e);
              if (e.key === 'Enter' && !saving) create();
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

      {target && editing && (
        <div className="cat-new">
          <Text size="sm" fw={600}>
            {target.cat.parent_id ? `编辑「${tops.find((t) => t.id === target.cat.parent_id)?.name} · ${target.cat.name}」` : `编辑「${target.cat.name}」`}
          </Text>
          <TextInput
            size="sm"
            aria-label="分类名称"
            autoFocus
            value={target.name}
            onChange={(e) => setTarget({ ...target, name: e.currentTarget.value })}
            onKeyDown={(e) => {
              keepFormOpen(e);
              if (e.key === 'Enter' && !saving) rename();
            }}
            error={error || undefined}
          />
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={remove} disabled={saving}>
              删除
            </Button>
            <Group gap="xs" wrap="nowrap">
              <Button variant="default" size="xs" onClick={() => setTarget(null)}>取消</Button>
              <Button size="xs" loading={saving} onClick={rename}>保存</Button>
            </Group>
          </Group>
        </div>
      )}
    </div>
  );
}
