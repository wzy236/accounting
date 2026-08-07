const express = require('express');
const dayjs = require('dayjs');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function categoryTotals(userId, type, start, end) {
  return db
    .prepare(
      `SELECT COALESCE(c.name, '未分类') AS name,
              COALESCE(c.color, '#8d99ae') AS color,
              SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.type = ? AND t.date >= ? AND t.date < ?
       GROUP BY COALESCE(c.id, -1)
       ORDER BY total DESC`
    )
    .all(userId, type, start, end);
}

router.get('/', (req, res) => {
  const userId = req.session.userId;
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : dayjs().format('YYYY-MM');
  const start = `${month}-01`;
  const end = dayjs(start).add(1, 'month').format('YYYY-MM-DD');

  const expenseData = categoryTotals(userId, 'expense', start, end);
  const incomeData = categoryTotals(userId, 'income', start, end);

  res.render('charts', {
    title: '统计图表',
    active: 'charts',
    month,
    expenseData,
    incomeData,
    expenseTotal: expenseData.reduce((s, d) => s + d.total, 0),
    incomeTotal: incomeData.reduce((s, d) => s + d.total, 0),
  });
});

module.exports = router;
