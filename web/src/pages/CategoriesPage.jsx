import { useState } from 'react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { createCategory, updateCategory, deleteCategory } from '../lib/api.js';
import { buildCategoryTree } from '../lib/format.js';

function CategoryRow({ cat, depth, hasChildren, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cat.name);

  function startEditing() {
    setDraft(cat.name);
    setEditing(true);
  }

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === cat.name) {
      setEditing(false);
      return;
    }
    if (await onRename(cat, trimmed)) setEditing(false);
  }

  return (
    <li className={depth ? 'subcategory' : undefined}>
      <span className="swatch" style={{ background: cat.color }}></span>
      {editing ? (
        <form className="rename-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input
            type="text"
            autoFocus
            required
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          />
          <button type="submit" className="link-btn">保存</button>
          <button type="button" className="link-btn" onClick={() => setEditing(false)}>取消</button>
        </form>
      ) : (
        <>
          <span className="cat-name">{cat.name}</span>
          <button type="button" className="link-btn" onClick={startEditing}>改名</button>
          <button type="button" className="link-btn danger" onClick={() => onDelete(cat, hasChildren)}>删除</button>
        </>
      )}
    </li>
  );
}

function CategoryList({ list, onRename, onDelete }) {
  if (list.length === 0) return <ul className="category-list"><li className="empty">暂无分类</li></ul>;
  return (
    <ul className="category-list">
      {buildCategoryTree(list).map(({ cat, depth }) => (
        <CategoryRow
          key={cat.id}
          cat={cat}
          depth={depth}
          hasChildren={list.some((c) => c.parent_id === cat.id)}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

export default function CategoriesPage() {
  const { client } = useSupabase();
  const showToast = useToast();
  const { categories, refreshCategories } = useData();

  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [parentId, setParentId] = useState('');
  const [color, setColor] = useState('#5c9ead');

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const incomeCategories = categories.filter((c) => c.type === 'income');
  const parentOptions = expenseCategories.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createCategory(client, {
        name: trimmed,
        type,
        color,
        parent_id: type === 'expense' ? parentId || null : null,
      });
      setName('');
      setParentId('');
      showToast('已添加分类');
      refreshCategories();
    } catch (e) {
      showToast('添加失败：' + (e.message?.includes('duplicate') ? '分类名已存在' : e.message), true);
    }
  }

  // 交易记录、定时账单都是按分类 id 关联的，改名后各处显示的名字会自动跟着变
  async function handleRename(cat, newName) {
    try {
      await updateCategory(client, cat.id, { name: newName });
      showToast('已改名');
      refreshCategories();
      return true;
    } catch (e) {
      showToast('改名失败：' + (e.message?.includes('duplicate') ? '同类型下已经有叫这个名字的分类了' : e.message), true);
      return false;
    }
  }

  async function handleDelete(cat, hasChildren) {
    const msg = hasChildren
      ? '删除后子分类会一起被删除，相关记录都会变为未分类，确认删除？'
      : '删除后该分类下的记录会变为未分类，确认删除？';
    if (!window.confirm(msg)) return;
    try {
      await deleteCategory(client, cat.id);
      showToast('已删除');
      refreshCategories();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
    }
  }

  return (
    <section>
      <h1>🏷️ 分类管理</h1>

      <section className="add-form-section">
        <h2>新增分类</h2>
        <form onSubmit={handleAdd} className="tx-form">
          <div className="tx-form-row">
            <label>名称
              <input type="text" placeholder="例如：宠物" required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>类型
              <select value={type} onChange={(e) => { setType(e.target.value); setParentId(''); }}>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </label>
            {type === 'expense' && (
              <label>父分类（支出分类可选）
                <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">无（作为顶级分类）</option>
                  {parentOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label>颜色
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <button type="submit" className="btn primary">添加分类</button>
          </div>
        </form>
      </section>

      <div className="category-columns">
        <section>
          <h2>支出分类</h2>
          <CategoryList list={expenseCategories} onRename={handleRename} onDelete={handleDelete} />
        </section>
        <section>
          <h2>收入分类</h2>
          <CategoryList list={incomeCategories} onRename={handleRename} onDelete={handleDelete} />
        </section>
      </div>
    </section>
  );
}
