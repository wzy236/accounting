const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parseStatementText } = require('../lib/bankStatementParser');

const router = express.Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('只支持上传 PDF 文件'));
    }
    cb(null, true);
  },
});

function getCategories(userId) {
  return db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY type, name').all(userId);
}

router.get('/', (req, res) => {
  const userId = req.session.userId;
  res.render('import', {
    title: '导入对账单',
    active: 'import',
    categories: getCategories(userId),
    pending: req.session.pendingImport || null,
    error: null,
  });
});

router.post('/upload', upload.single('pdf'), async (req, res) => {
  const userId = req.session.userId;
  try {
    if (!req.file) {
      return res.render('import', {
        title: '导入对账单',
        active: 'import',
        categories: getCategories(userId),
        pending: null,
        error: '请选择一个 PDF 文件',
      });
    }

    const { text } = await pdfParse(req.file.buffer);
    const candidates = parseStatementText(text);

    if (candidates.length === 0) {
      return res.render('import', {
        title: '导入对账单',
        active: 'import',
        categories: getCategories(userId),
        pending: null,
        error: '未能从该 PDF 中识别出任何交易记录，可能格式不受支持，请检查文件或尝试其他对账单。',
      });
    }

    req.session.pendingImport = candidates;
    res.render('import', {
      title: '导入对账单',
      active: 'import',
      categories: getCategories(userId),
      pending: candidates,
      error: null,
    });
  } catch (e) {
    console.error(e);
    res.render('import', {
      title: '导入对账单',
      active: 'import',
      categories: getCategories(userId),
      pending: null,
      error: '解析 PDF 失败：' + e.message,
    });
  }
});

router.post('/confirm', (req, res) => {
  const userId = req.session.userId;
  const pending = req.session.pendingImport;
  if (!pending || pending.length === 0) {
    return res.redirect('/import');
  }

  const dates = [].concat(req.body.date || []);
  const descriptions = [].concat(req.body.description || []);
  const amounts = [].concat(req.body.amount || []);
  const types = [].concat(req.body.type || []);
  const categoryIds = [].concat(req.body.category_id || []);
  const includes = new Set([].concat(req.body.include || []).map(String));

  const insert = db.prepare(
    'INSERT INTO transactions (user_id, date, type, amount, category_id, description, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    let count = 0;
    for (let i = 0; i < pending.length; i++) {
      if (!includes.has(String(i))) continue;
      const amt = parseFloat(amounts[i]);
      if (!dates[i] || !(amt > 0)) continue;
      const type = types[i] === 'income' ? 'income' : 'expense';
      insert.run(
        userId,
        dates[i],
        type,
        amt,
        categoryIds[i] || null,
        (descriptions[i] || '').trim(),
        'pdf_import'
      );
      count++;
    }
    return count;
  });

  const imported = tx();
  delete req.session.pendingImport;
  res.redirect('/transactions?imported=' + imported);
});

router.post('/cancel', (req, res) => {
  delete req.session.pendingImport;
  res.redirect('/import');
});

router.use((err, req, res, next) => {
  res.render('import', {
    title: '导入对账单',
    active: 'import',
    categories: getCategories(req.session.userId),
    pending: null,
    error: err.message || '上传失败',
  });
});

module.exports = router;
