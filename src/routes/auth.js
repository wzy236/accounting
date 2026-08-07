const express = require('express');
const bcrypt = require('bcryptjs');
const { db, seedDefaultCategories } = require('../db');

const router = express.Router();

router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('register', { error: null });
});

router.post('/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const confirm = req.body.confirm || '';

  if (username.length < 3) {
    return res.render('register', { error: '用户名至少需要 3 个字符' });
  }
  if (password.length < 6) {
    return res.render('register', { error: '密码至少需要 6 个字符' });
  }
  if (password !== confirm) {
    return res.render('register', { error: '两次输入的密码不一致' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.render('register', { error: '用户名已被占用' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid: userId } = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);

  seedDefaultCategories(userId);

  req.session.userId = userId;
  req.session.username = username;
  res.redirect('/');
});

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: '用户名或密码错误' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
