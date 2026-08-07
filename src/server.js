const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const transactionRoutes = require('./routes/transactions');
const chartRoutes = require('./routes/charts');
const importRoutes = require('./routes/import');

const app = express();
const PORT = process.env.PORT || 3000;

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secretPath = path.join(__dirname, '..', 'db', '.session-secret');
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8');
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(attachUser);

app.use('/', authRoutes);
app.use('/categories', categoryRoutes);
app.use('/transactions', transactionRoutes);
app.use('/charts', chartRoutes);
app.use('/import', importRoutes);

const { requireAuth } = require('./middleware/auth');
const { db } = require('./db');

app.get('/', requireAuth, (req, res) => {
  res.redirect('/transactions');
});

app.use((req, res) => {
  res.status(404).render('404');
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('服务器内部错误：' + err.message);
});

app.listen(PORT, () => {
  console.log(`记账网站已启动：http://localhost:${PORT}`);
});
