const express = require('express');
const dayjs = require('dayjs');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function getCategories(userId) {
  return db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY type, name').all(userId);
}

router.get('/', (req, res) => {
  const userId = req.session.userId;
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : dayjs().format('YYYY-MM');
  const start = `${month}-01`;
  const end = dayjs(start).add(1, 'month').format('YYYY-MM-DD');

  const transactions = db
    .prepare(
      `SELECT t.*, c.name AS category_name, c.color AS category_color
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.date >= ? AND t.date < ?
       ORDER BY t.date DESC, t.id DESC`
    )
    .all(userId, start, end);

  const totals = db
    .prepare(
      `SELECT type, COALESCE(SUM(amount), 0) AS total
       FROM transactions WHERE user_id = ? AND date >= ? AND date < ? GROUP BY type`
    )
    .all(userId, start, end);

  const income = totals.find((t) => t.type === 'income')?.total || 0;
  const expense = totals.find((t) => t.type === 'expense')?.total || 0;

  res.render('transactions', {
    title: '记账',
    active: 'transactions',
    transactions,
    categories: getCategories(userId),
    month,
    income,
    expense,
    balance: income - expense,
    imported: parseInt(req.query.imported, 10) || 0,
    error: null,
  });
});

router.post('/', (req, res) => {
  const userId = req.session.userId;
  const { date, type, amount, category_id, description } = req.body;
  const amt = parseFloat(amount);
  const t = type === 'income' ? 'income' : 'expense';

  if (!date || !(amt > 0)) {
    return res.redirect('/transactions?month=' + (req.body.month || ''));
  }

  db.prepare(
    'INSERT INTO transactions (user_id, date, type, amount, category_id, description, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, date, t, amt, category_id || null, (description || '').trim(), 'manual');

  res.redirect('/transactions?month=' + dayjs(date).format('YYYY-MM'));
});

router.post('/:id/delete', (req, res) => {
  const userId = req.session.userId;
  db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.redirect(req.get('Referer') || '/transactions');
});

router.post('/:id', (req, res) => {
  const userId = req.session.userId;
  const { date, type, amount, category_id, description } = req.body;
  const amt = parseFloat(amount);
  const t = type === 'income' ? 'income' : 'expense';

  if (!date || !(amt > 0)) {
    return res.redirect('/transactions');
  }

  db.prepare(
    `UPDATE transactions SET date = ?, type = ?, amount = ?, category_id = ?, description = ?
     WHERE id = ? AND user_id = ?`
  ).run(date, t, amt, category_id || null, (description || '').trim(), req.params.id, userId);

  res.redirect('/transactions?month=' + dayjs(date).format('YYYY-MM'));
});

module.exports = router;
