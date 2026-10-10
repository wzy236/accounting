import { useState } from 'react';
import {
  ActionIcon, Button, ColorInput, Menu, Modal, SegmentedControl, Select, Stack, Text, TextInput,
} from '@mantine/core';
import { IconDotsVertical, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { confirmAction } from '../lib/confirm.jsx';
import { createCategory, updateCategory, deleteCategory } from '../lib/api.js';
import { buildCategoryTree } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';

const SWATCHES = ['#f25a5a', '#f59f45', '#f2c94c', '#6fcf97', '#2f9e8f', '#2f7ee6', '#5b6ee8', '#9b6bd8', '#e86fa8', '#8d99ae'];

const duplicateMessage = (err) =>
  err.message?.includes('duplicate') ? '同类型下已经有叫这个名字的分类了' : err.message;

function NewCategoryForm({ categories, defaultType, onDone }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState(defaultType);
  const [parentId, setParentId] = useState(null);
  const [color, setColor] = useState('#2f7ee6');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const parentOptions = categories
    .filter((c) => c.type === 'expense' && !c.parent_id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: String(c.id), label: c.name }));

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    try {
      await createCategory(client, { name: trimmed, type, color, parent_id: type === 'expense' ? parentId : null });
      showToast('已添加分类');
      onDone();
    } catch (err) {
      setError(duplicateMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          data={[{ label: '支出', value: 'expense' }, { label: '收入', value: 'income' }]}
          value={type}
          onChange={(v) => { setType(v); setParentId(null); }}
        />
        <TextInput label="名称" placeholder="例如：宠物" required value={name} onChange={(e) => setName(e.target.value)} error={error} data-autofocus />
        {type === 'expense' && (
          <Select
            label="父分类"
            description="选一个大类就会作为它的子分类，不选就是顶级分类"
            placeholder="无（作为顶级分类）"
            data={parentOptions}
            value={parentId}
            onChange={setParentId}
            clearable
            comboboxProps={{ withinPortal: true }}
          />
        )}
        <ColorInput label="颜色" value={color} onChange={setColor} swatches={SWATCHES} swatchesPerRow={10} />
        <Button type="submit" loading={saving}>添加分类</Button>
      </Stack>
    </form>
  );
}

function RenameForm({ category, onDone }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const [name, setName] = useState(category.name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // 交易记录、定时账单都是按分类 id 关联的，改名后各处显示的名字会自动跟着变
  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
      onDone(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateCategory(client, category.id, { name: trimmed });
      showToast('已改名');
      onDone(true);
    } catch (err) {
      setError(duplicateMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <TextInput label="新名称" required value={name} onChange={(e) => setName(e.target.value)} error={error} data-autofocus />
        <Button type="submit" loading={saving}>保存</Button>
      </Stack>
    </form>
  );
}

export default function CategoriesPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, refreshCategories } = useData();

  const [type, setType] = useState('expense');
  const [newOpened, setNewOpened] = useState(false);
  const [renaming, setRenaming] = useState(null);

  const list = categories.filter((c) => c.type === type);
  const tree = buildCategoryTree(list);

  async function handleDelete(cat) {
    const hasChildren = list.some((c) => c.parent_id === cat.id);
    const ok = await confirmAction({
      title: `删除「${cat.name}」`,
      message: hasChildren
        ? '删除后子分类会一起被删除，相关记录都会变为未分类，确认删除？'
        : '删除后该分类下的记录会变为未分类，确认删除？',
      confirmLabel: '删除',
    });
    if (!ok) return;
    try {
      await deleteCategory(client, cat.id);
      showToast('已删除');
      refreshCategories();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
    }
  }

  return (
    <>
      <PageHeader
        title="分类管理"
        back="/more"
        right={(
          <>
            <Button size="sm" visibleFrom="sm" leftSection={<IconPlus size={16} />} onClick={() => setNewOpened(true)}>新增分类</Button>
            <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" onClick={() => setNewOpened(true)} aria-label="新增分类"><IconPlus size={22} /></ActionIcon>
          </>
        )}
      />
      <div className="page-body">
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            data={[{ label: '支出分类', value: 'expense' }, { label: '收入分类', value: 'income' }]}
            value={type}
            onChange={setType}
            color={type === 'income' ? 'blue' : 'coral'}
          />
          <div className="card">
            {tree.length === 0 ? (
              <div className="empty-state">暂无分类</div>
            ) : tree.map(({ cat, depth }) => {
              const childCount = depth ? 0 : list.filter((c) => c.parent_id === cat.id).length;
              return (
                <Menu key={cat.id} position="bottom-end" withinPortal shadow="md" width={150}>
                  <Menu.Target>
                    <button type="button" className={`list-row${depth ? ' sub' : ''}`}>
                      <span className="dot" style={{ background: cat.color }} />
                      <span className="list-row-main">{cat.name}</span>
                      {childCount > 0 && <Text size="xs" c="dimmed">{childCount} 个子分类</Text>}
                      <IconDotsVertical size={16} color="var(--mantine-color-gray-5)" />
                    </button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => setRenaming(cat)}>改名</Menu.Item>
                    <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => handleDelete(cat)}>删除</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              );
            })}
          </div>
        </Stack>
      </div>

      <Modal opened={newOpened} onClose={() => setNewOpened(false)} title={<Text fw={700}>新增分类</Text>} centered>
        {newOpened && (
          <NewCategoryForm
            categories={categories}
            defaultType={type}
            onDone={() => { setNewOpened(false); refreshCategories(); }}
          />
        )}
      </Modal>

      <Modal opened={!!renaming} onClose={() => setRenaming(null)} title={<Text fw={700}>修改分类名称</Text>} centered>
        {renaming && (
          <RenameForm
            key={renaming.id}
            category={renaming}
            onDone={(changed) => { setRenaming(null); if (changed) refreshCategories(); }}
          />
        )}
      </Modal>
    </>
  );
}
