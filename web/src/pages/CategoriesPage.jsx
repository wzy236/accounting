import { useState } from 'react';
import {
  ActionIcon, Button, ColorInput, ColorSwatch, Group, Input, Menu, Modal, SegmentedControl, Stack, Text, TextInput, Tooltip,
} from '@mantine/core';
import { IconCheck, IconDotsVertical, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/toast.js';
import { useData } from '../lib/DataContext.jsx';
import { confirmAction } from '../lib/confirm.jsx';
import { createCategory, updateCategory, deleteCategory } from '../lib/api.js';
import { buildCategoryTree } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';

const SWATCHES = [
  '#f25a5a', '#f59f45', '#f2c94c', '#a3c94f', '#6fcf97', '#2f9e8f',
  '#4fb3d9', '#2f7ee6', '#5b6ee8', '#9b6bd8', '#e86fa8', '#8d99ae',
];

const duplicateMessage = (err) =>
  err.message?.includes('duplicate') ? '同类型下已经有叫这个名字的分类了' : err.message;

function ColorField({ value, onChange }) {
  return (
    <Input.Wrapper label="颜色">
      <Group gap={8} mt={6} mb={8}>
        {SWATCHES.map((c) => (
          <ColorSwatch
            key={c}
            component="button"
            type="button"
            color={c}
            size={28}
            onClick={() => onChange(c)}
            aria-label={`颜色 ${c}`}
            style={{ color: '#fff', cursor: 'pointer' }}
          >
            {value?.toLowerCase() === c && <IconCheck size={16} />}
          </ColorSwatch>
        ))}
      </Group>
      <ColorInput value={value} onChange={onChange} placeholder="也可以输入自定义颜色，例如 #ff8800" aria-label="自定义颜色" />
    </Input.Wrapper>
  );
}

/**
 * 新增顶级分类 / 在某个大类下新增子分类 / 编辑已有分类（名称和颜色）共用一个表单。
 * target: { kind: 'create', type } | { kind: 'createSub', parent } | { kind: 'edit', category, parent? }
 */
function CategoryForm({ target, onDone }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const isEdit = target.kind === 'edit';

  const [type, setType] = useState(target.type || target.parent?.type || target.category?.type || 'expense');
  const [name, setName] = useState(isEdit ? target.category.name : '');
  const [color, setColor] = useState(isEdit ? target.category.color : target.parent?.color || '#2f7ee6');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    let fields = null;
    if (isEdit) {
      fields = {};
      if (trimmed !== target.category.name) fields.name = trimmed;
      if (color !== target.category.color) fields.color = color;
      if (Object.keys(fields).length === 0) {
        onDone(false);
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        // 交易记录、定时账单都是按分类 id 关联的，改名/改色后各处会自动跟着变
        await updateCategory(client, target.category.id, fields);
        showToast('已保存');
      } else {
        await createCategory(client, { name: trimmed, type, color, parent_id: target.parent?.id || null });
        showToast(target.parent ? `已添加到「${target.parent.name}」下` : '已添加分类');
      }
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
        {target.kind === 'create' && (
          <SegmentedControl
            fullWidth
            data={[{ label: '支出', value: 'expense' }, { label: '收入', value: 'income' }]}
            value={type}
            color={type === 'income' ? 'blue' : 'coral'}
            onChange={setType}
          />
        )}
        {target.parent && (
          <Group gap={6}>
            <Text size="sm" c="dimmed">上级分类</Text>
            <span className="dot" style={{ background: target.parent.color }} />
            <Text size="sm" fw={600}>{target.parent.name}</Text>
          </Group>
        )}
        <TextInput
          label="名称"
          placeholder={target.parent ? '例如：早餐' : '例如：宠物'}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          data-autofocus
        />
        <ColorField value={color} onChange={setColor} />
        <Button type="submit" loading={saving}>{isEdit ? '保存' : '添加'}</Button>
      </Stack>
    </form>
  );
}

function formTitle(target) {
  if (target.kind === 'edit') return `编辑「${target.category.name}」`;
  if (target.kind === 'createSub') return `添加「${target.parent.name}」的子分类`;
  return '新增分类';
}

export default function CategoriesPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, refreshCategories } = useData();

  const [type, setType] = useState('expense');
  const [target, setTarget] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const list = categories.filter((c) => c.type === type);
  const tree = buildCategoryTree(list);

  function openForm(t) {
    setTarget(t);
    setFormKey((k) => k + 1);
  }

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

  const addTop = () => openForm({ kind: 'create', type });

  return (
    <>
      <PageHeader
        title="分类管理"
        back="/more"
        right={(
          <>
            <Button size="sm" visibleFrom="sm" leftSection={<IconPlus size={16} />} onClick={addTop}>新增分类</Button>
            <ActionIcon variant="subtle" size="lg" hiddenFrom="sm" onClick={addTop} aria-label="新增分类"><IconPlus size={22} /></ActionIcon>
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
          <Text size="xs" c="dimmed">点分类可以修改名称和颜色，点大类右边的 + 可以直接在它下面添加子分类。</Text>
          <div className="card">
            {tree.length === 0 ? (
              <div className="empty-state">暂无分类</div>
            ) : tree.map(({ cat, depth }) => {
              const parent = depth ? list.find((c) => c.id === cat.parent_id) : null;
              const childCount = depth ? 0 : list.filter((c) => c.parent_id === cat.id).length;
              const edit = () => openForm({ kind: 'edit', category: cat, parent });
              const addSub = () => openForm({ kind: 'createSub', parent: cat });
              return (
                <div key={cat.id} className={`list-row${depth ? ' sub' : ''}`}>
                  <button type="button" className="category-main" onClick={edit}>
                    <span className="dot" style={{ background: cat.color }} />
                    <span className="list-row-main">{cat.name}</span>
                    {childCount > 0 && <Text size="xs" c="dimmed" span>{childCount} 个子分类</Text>}
                  </button>
                  {!depth && (
                    <Tooltip label="添加子分类" withArrow>
                      <ActionIcon variant="subtle" color="gray" onClick={addSub} aria-label={`在「${cat.name}」下添加子分类`}>
                        <IconPlus size={17} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Menu position="bottom-end" withinPortal shadow="md" width={170}>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" aria-label={`「${cat.name}」更多操作`}>
                        <IconDotsVertical size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {!depth && <Menu.Item leftSection={<IconPlus size={16} />} onClick={addSub}>添加子分类</Menu.Item>}
                      <Menu.Item leftSection={<IconPencil size={16} />} onClick={edit}>编辑名称和颜色</Menu.Item>
                      <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => handleDelete(cat)}>删除</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </div>
              );
            })}
          </div>
        </Stack>
      </div>

      <Modal opened={!!target} onClose={() => setTarget(null)} title={target && <Text fw={700}>{formTitle(target)}</Text>} centered>
        {target && (
          <CategoryForm
            key={formKey}
            target={target}
            onDone={(changed) => { setTarget(null); if (changed) refreshCategories(); }}
          />
        )}
      </Modal>
    </>
  );
}
