const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'accounting.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    color TEXT NOT NULL DEFAULT '#888888',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name, type)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    amount REAL NOT NULL CHECK(amount > 0),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    description TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id, type);
`);

const DEFAULT_CATEGORIES = [
  { name: '餐饮', type: 'expense', color: '#e07a5f' },
  { name: '交通', type: 'expense', color: '#3d5a80' },
  { name: '购物', type: 'expense', color: '#f2cc8f' },
  { name: '娱乐', type: 'expense', color: '#81b29a' },
  { name: '住房', type: 'expense', color: '#6d597a' },
  { name: '医疗', type: 'expense', color: '#b56576' },
  { name: '其他支出', type: 'expense', color: '#8d99ae' },
  { name: '工资', type: 'income', color: '#4caf50' },
  { name: '奖金', type: 'income', color: '#2a9d8f' },
  { name: '理财', type: 'income', color: '#457b9d' },
  { name: '其他收入', type: 'income', color: '#a8dadc' },
];

function seedDefaultCategories(userId) {
  const insert = db.prepare(
    'INSERT INTO categories (user_id, name, type, color) VALUES (?, ?, ?, ?)'
  );
  const tx = db.transaction((categories) => {
    for (const c of categories) insert.run(userId, c.name, c.type, c.color);
  });
  tx(DEFAULT_CATEGORIES);
}

module.exports = { db, seedDefaultCategories };
