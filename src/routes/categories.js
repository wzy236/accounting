const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const userId = req.session.userId;
  const expense = db
    .prepare('SELECT * FROM categories WHERE user_id = ? AND type = ? ORDER BY name')
    .all(userId, 'expense');
  const income = db
    .prepare('SELECT * FROM categories WHERE user_id = ? AND type = ? ORDER BY name')
    .all(userId, 'income');
  res.render('categories', { title: '分类管理', active: 'categories', expense, income, error: null });
});

router.post('/', (req, res) => {
  const userId = req.session.userId;
  const name = (req.body.name || '').trim();
  const type = req.body.type === 'income' ? 'income' : 'expense';
  const color = /^#[0-9a-fA-F]{6}$/.test(req.body.color || '') ? req.body.color : '#888888';

  if (!name) {
    return res.redirect('/categories');
  }

  try {
    db.prepare('INSERT INTO categories (user_id, name, type, color) VALUES (?, ?, ?, ?)').run(
      userId,
      name,
      type,
      color
    );
  } catch (e) {
    // 分类名+类型 唯一约束冲突时忽略
  }
  res.redirect('/categories');
});

router.post('/:id/delete', (req, res) => {
  const userId = req.session.userId;
  db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.redirect('/categories');
});

module.exports = router;
