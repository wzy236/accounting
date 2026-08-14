import { signUp, signIn, signOut, isLoggedIn, getCurrentUser, clearLocalSession } from './supabaseClient.js';
import { getSupabaseConfig, setSupabaseConfig, resetSupabaseConfig, hasCustomSupabaseConfig } from './config.js';
import {
  listCategories,
  ensureDefaultCategories,
  createCategory,
  deleteCategory,
  listTransactionsForMonth,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  createTransactionsBulk,
  aggregateByCategory,
  listAccounts,
  createAccount,
  deleteAccount,
  getAccountBalances,
  listRecurringBills,
  createRecurringBill,
  updateRecurringBill,
  deleteRecurringBill,
  generateDueRecurringTransactions,
} from './api.js';
import { parseStatementText } from './bankStatementParser.js';

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
}

let categories = [];
let accounts = [];
let currentMonth = defaultMonth();
let pendingImport = null;
let expenseChart = null;
let incomeChart = null;

function defaultMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmt(n) {
  return '¥' + Number(n || 0).toFixed(2);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function showToast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('toast-error', isError);
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 3000);
}

function populateCategorySelect(selectEl, type, currentId) {
  const opts = categories.filter((c) => c.type === type);
  selectEl.innerHTML = '<option value="">未分类</option>' +
    opts.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if (currentId) selectEl.value = String(currentId);
}

function populateAccountSelect(selectEl, currentId) {
  selectEl.innerHTML = '<option value="">不选择</option>' +
    accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}${a.type === 'credit_card' ? '（信用卡）' : ''}</option>`).join('');
  if (currentId) selectEl.value = String(currentId);
}

/** categories/accounts 是异步加载的，加载完之后要把已经渲染好的“新增”表单的下拉选项刷新一遍。 */
function refreshFormSelects() {
  const txForm = document.getElementById('add-tx-form');
  if (txForm) {
    populateCategorySelect(txForm.querySelector('.category-select'), txForm.querySelector('.type-select').value, null);
    populateAccountSelect(txForm.querySelector('.account-select'), null);
  }
  const billForm = document.getElementById('add-bill-form');
  if (billForm) {
    populateCategorySelect(billForm.querySelector('.category-select'), billForm.querySelector('.type-select').value, null);
    populateAccountSelect(billForm.querySelector('.account-select'), null);
  }
}

/* ================= 认证 ================= */

function showAuth() {
  document.getElementById('auth-view').hidden = false;
  document.getElementById('app-view').hidden = true;
  document.getElementById('config-view').hidden = true;
}

let configReturnTo = 'auth';

function showConfigPage(returnTo) {
  configReturnTo = returnTo;
  document.getElementById('auth-view').hidden = true;
  document.getElementById('app-view').hidden = true;
  document.getElementById('config-view').hidden = false;

  const { url } = getSupabaseConfig();
  document.getElementById('config-status').textContent = hasCustomSupabaseConfig()
    ? `当前使用自定义项目：${url}`
    : `当前使用默认项目：${url}`;
  const form = document.getElementById('config-form');
  form.reset();
  form.elements.url.value = url;
  document.getElementById('config-error').hidden = true;
  document.getElementById('config-success').hidden = true;
}

function backFromConfigPage() {
  if (configReturnTo === 'app' && isLoggedIn()) showApp();
  else showAuth();
}

function wireConfigForm() {
  const form = document.getElementById('config-form');
  const errorEl = document.getElementById('config-error');
  const successEl = document.getElementById('config-success');

  document.getElementById('show-config-from-auth').addEventListener('click', (e) => {
    e.preventDefault();
    showConfigPage('auth');
  });
  document.getElementById('config-from-app-btn').addEventListener('click', () => {
    showConfigPage('app');
  });
  document.getElementById('config-back').addEventListener('click', (e) => {
    e.preventDefault();
    backFromConfigPage();
  });

  document.getElementById('config-reset').addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirm('恢复默认 Supabase 配置？这会清除当前登录状态。')) return;
    resetSupabaseConfig();
    clearLocalSession();
    location.reload();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    successEl.hidden = true;
    const fd = new FormData(form);
    const url = fd.get('url').trim().replace(/\/+$/, '');
    const anonKey = fd.get('anonKey').trim();
    if (!url || !anonKey) return;
    try {
      new URL(url);
    } catch {
      errorEl.textContent = 'Supabase URL 格式不对，应该形如 https://xxxx.supabase.co';
      errorEl.hidden = false;
      return;
    }
    setSupabaseConfig(url, anonKey);
    clearLocalSession();
    successEl.textContent = '已保存，正在重新加载…';
    successEl.hidden = false;
    setTimeout(() => location.reload(), 600);
  });
}

async function showApp() {
  document.getElementById('auth-view').hidden = true;
  document.getElementById('app-view').hidden = false;
  document.getElementById('current-user-email').textContent = getCurrentUser()?.email || '';
  try {
    categories = await ensureDefaultCategories();
  } catch (e) {
    showToast('加载分类失败：' + e.message, true);
  }
  try {
    accounts = await listAccounts();
  } catch {
    // 账户表可能还没建（比如用的是没跑过最新 schema.sql 的旧项目），不阻塞其他功能
  }
  try {
    const generated = await generateDueRecurringTransactions();
    if (generated > 0) showToast(`已自动生成 ${generated} 笔到期账单`);
  } catch {
    // 同上，定时账单表不存在时静默跳过
  }
  refreshFormSelects();
  handleRoute();
}

function wireAuthForms() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');
  const registerSuccess = document.getElementById('register-success');

  document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.hidden = true;
    registerForm.hidden = false;
    document.getElementById('switch-to-login-line').hidden = false;
    e.target.closest('.auth-switch').hidden = true;
  });

  document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.hidden = true;
    loginForm.hidden = false;
    document.getElementById('switch-to-login-line').hidden = true;
    document.querySelector('.auth-switch').hidden = false;
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const fd = new FormData(loginForm);
    try {
      await signIn(fd.get('email').trim(), fd.get('password'));
      await showApp();
    } catch (err) {
      loginError.textContent = err.status === 400 ? '邮箱或密码错误' : err.message;
      loginError.hidden = false;
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.hidden = true;
    registerSuccess.hidden = true;
    const fd = new FormData(registerForm);
    const password = fd.get('password');
    if (password !== fd.get('confirm')) {
      registerError.textContent = '两次输入的密码不一致';
      registerError.hidden = false;
      return;
    }
    try {
      const result = await signUp(fd.get('email').trim(), password);
      if (result.needsEmailConfirmation) {
        registerSuccess.textContent = '注册成功，请前往邮箱完成确认后再登录。';
        registerSuccess.hidden = false;
        registerForm.reset();
      } else {
        await showApp();
      }
    } catch (err) {
      registerError.textContent = err.message;
      registerError.hidden = false;
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut();
    showAuth();
  });
}

/* ================= 路由 ================= */

function handleRoute() {
  const view = (location.hash.replace('#/', '') || 'transactions').split('?')[0];
  document.querySelectorAll('.view').forEach((el) => { el.hidden = el.id !== `view-${view}`; });
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === view);
  });
  if (view === 'transactions') reloadTransactions();
  else if (view === 'accounts') reloadAccounts();
  else if (view === 'bills') reloadBills();
  else if (view === 'categories') reloadCategories();
  else if (view === 'charts') reloadCharts();
  else if (view === 'import') resetImportView();
}

/* ================= 记账 ================= */

async function reloadTransactions() {
  const monthPicker = document.getElementById('tx-month-picker');
  monthPicker.value = currentMonth;

  let transactions;
  try {
    transactions = await listTransactionsForMonth(currentMonth);
  } catch (e) {
    showToast('加载记录失败：' + e.message, true);
    return;
  }

  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  document.getElementById('summary-income').textContent = fmt(income);
  document.getElementById('summary-expense').textContent = fmt(expense);
  document.getElementById('summary-balance').textContent = fmt(income - expense);

  const tbody = document.getElementById('tx-table-body');
  tbody.innerHTML = '';
  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">本月还没有记录</td></tr>';
  } else {
    transactions.forEach((t) => tbody.appendChild(renderTransactionRow(t)));
  }
}

function renderTransactionRow(t) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="date" class="f-date" value="${t.date}" /></td>
    <td>
      <select class="f-type type-select">
        <option value="expense" ${t.type === 'expense' ? 'selected' : ''}>支出</option>
        <option value="income" ${t.type === 'income' ? 'selected' : ''}>收入</option>
      </select>
    </td>
    <td><select class="f-category category-select"></select></td>
    <td><select class="f-account account-select"></select></td>
    <td><input type="number" class="f-amount" step="0.01" min="0.01" value="${t.amount}" /></td>
    <td><input type="text" class="f-desc" value="${escapeHtml(t.description || '')}" /></td>
    <td><span class="tag">${t.source === 'pdf_import' ? 'PDF导入' : t.source === 'recurring' ? '定时账单' : '手动'}</span></td>
    <td class="row-actions"><button type="button" class="link-btn save-btn">保存</button></td>
    <td class="delete-cell"><button type="button" class="link-btn danger delete-btn">删除</button></td>
  `;

  const categorySelect = tr.querySelector('.f-category');
  populateCategorySelect(categorySelect, t.type, t.category_id);
  const accountSelect = tr.querySelector('.f-account');
  populateAccountSelect(accountSelect, t.account_id);

  tr.querySelector('.f-type').addEventListener('change', (e) => {
    populateCategorySelect(categorySelect, e.target.value, null);
  });

  tr.querySelector('.save-btn').addEventListener('click', async () => {
    try {
      await updateTransaction(t.id, {
        date: tr.querySelector('.f-date').value,
        type: tr.querySelector('.f-type').value,
        amount: parseFloat(tr.querySelector('.f-amount').value),
        category_id: categorySelect.value || null,
        account_id: accountSelect.value || null,
        description: tr.querySelector('.f-desc').value.trim(),
      });
      showToast('已保存');
      await reloadTransactions();
    } catch (e) {
      showToast('保存失败：' + e.message, true);
    }
  });

  tr.querySelector('.delete-btn').addEventListener('click', async () => {
    if (!confirm('确认删除这条记录？')) return;
    try {
      await deleteTransaction(t.id);
      showToast('已删除');
      await reloadTransactions();
    } catch (e) {
      showToast('删除失败：' + e.message, true);
    }
  });

  return tr;
}

function wireTransactionForm() {
  document.getElementById('tx-month-picker').addEventListener('change', (e) => {
    currentMonth = e.target.value;
    reloadTransactions();
  });

  const addForm = document.getElementById('add-tx-form');
  addForm.querySelector('input[name="date"]').value = todayStr();
  const addCategorySelect = addForm.querySelector('.category-select');
  populateCategorySelect(addCategorySelect, 'expense', null);
  const addAccountSelect = addForm.querySelector('.account-select');
  populateAccountSelect(addAccountSelect, null);
  addForm.querySelector('.type-select').addEventListener('change', (e) => {
    populateCategorySelect(addCategorySelect, e.target.value, null);
  });

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(addForm);
    try {
      await createTransaction({
        date: fd.get('date'),
        type: fd.get('type'),
        amount: parseFloat(fd.get('amount')),
        category_id: fd.get('category_id') || null,
        account_id: fd.get('account_id') || null,
        description: (fd.get('description') || '').trim(),
      });
      addForm.reset();
      addForm.querySelector('input[name="date"]').value = todayStr();
      populateCategorySelect(addCategorySelect, 'expense', null);
      populateAccountSelect(addAccountSelect, null);
      showToast('已添加');
      await reloadTransactions();
    } catch (e) {
      showToast('添加失败：' + e.message, true);
    }
  });
}

/* ================= 分类管理 ================= */

async function reloadCategories() {
  try {
    categories = await listCategories();
  } catch (e) {
    showToast('加载分类失败：' + e.message, true);
    return;
  }
  renderCategoryList('expense-category-list', categories.filter((c) => c.type === 'expense'));
  renderCategoryList('income-category-list', categories.filter((c) => c.type === 'income'));
  refreshFormSelects();
}

function renderCategoryList(elId, list) {
  const ul = document.getElementById(elId);
  ul.innerHTML = '';
  if (list.length === 0) {
    ul.innerHTML = '<li class="empty">暂无分类</li>';
    return;
  }
  list.forEach((c) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="swatch" style="background: ${escapeHtml(c.color)}"></span>
      <span class="cat-name">${escapeHtml(c.name)}</span>
      <button type="button" class="link-btn danger delete-cat-btn">删除</button>
    `;
    li.querySelector('.delete-cat-btn').addEventListener('click', async () => {
      if (!confirm('删除后该分类下的记录会变为未分类，确认删除？')) return;
      try {
        await deleteCategory(c.id);
        showToast('已删除');
        await reloadCategories();
      } catch (e) {
        showToast('删除失败：' + e.message, true);
      }
    });
    ul.appendChild(li);
  });
}

function wireCategoryForm() {
  const form = document.getElementById('add-category-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = fd.get('name').trim();
    if (!name) return;
    try {
      await createCategory({ name, type: fd.get('type'), color: fd.get('color') });
      form.reset();
      showToast('已添加分类');
      await reloadCategories();
    } catch (e) {
      showToast('添加失败：' + (e.data?.message?.includes('duplicate') ? '分类名已存在' : e.message), true);
    }
  });
}

/* ================= 账户 ================= */

async function reloadAccounts() {
  try {
    accounts = await getAccountBalances();
  } catch (e) {
    showToast('加载账户失败：' + e.message, true);
    return;
  }
  renderAccountList(accounts);
  refreshFormSelects();
}

function renderAccountList(list) {
  const ul = document.getElementById('account-list');
  ul.innerHTML = '';
  if (list.length === 0) {
    ul.innerHTML = '<li class="empty">还没有账户，先在上面添加一个吧</li>';
    return;
  }
  list.forEach((a) => {
    const li = document.createElement('li');
    const balanceClass = a.balance > 0 ? 'positive' : a.balance < 0 ? 'negative' : '';
    li.innerHTML = `
      <span class="swatch" style="background: ${escapeHtml(a.color)}"></span>
      <span class="cat-name">${escapeHtml(a.name)} <span class="tag">${a.type === 'credit_card' ? '信用卡' : '银行账户'}</span></span>
      <span class="balance ${balanceClass}">${fmt(a.balance)}</span>
      <button type="button" class="link-btn danger delete-acc-btn">删除</button>
    `;
    li.querySelector('.delete-acc-btn').addEventListener('click', async () => {
      if (!confirm('删除后该账户下的记录会变为不关联任何账户，确认删除？')) return;
      try {
        await deleteAccount(a.id);
        showToast('已删除');
        await reloadAccounts();
      } catch (e) {
        showToast('删除失败：' + e.message, true);
      }
    });
    ul.appendChild(li);
  });
}

function wireAccountForm() {
  const form = document.getElementById('add-account-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = fd.get('name').trim();
    if (!name) return;
    try {
      await createAccount({
        name,
        type: fd.get('type'),
        initial_balance: parseFloat(fd.get('initial_balance')) || 0,
        color: fd.get('color'),
      });
      form.reset();
      form.querySelector('input[name="initial_balance"]').value = '0';
      showToast('已添加账户');
      await reloadAccounts();
    } catch (e) {
      showToast('添加失败：' + (e.data?.message?.includes('duplicate') ? '账户名已存在' : e.message), true);
    }
  });
}

/* ================= 定时账单 ================= */

function formatFrequency(bill) {
  if (bill.frequency === 'daily') return '每天';
  if (bill.frequency === 'weekly') return '每周' + ['日', '一', '二', '三', '四', '五', '六'][bill.day_of_week];
  return `每月 ${bill.day_of_month} 号`;
}

async function reloadBills() {
  let bills;
  try {
    bills = await listRecurringBills();
  } catch (e) {
    showToast('加载定时账单失败：' + e.message, true);
    return;
  }
  renderBillList(bills);
}

function renderBillList(list) {
  const ul = document.getElementById('bill-list');
  ul.innerHTML = '';
  if (list.length === 0) {
    ul.innerHTML = '<li class="empty">还没有定时账单</li>';
    return;
  }
  list.forEach((b) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="cat-name">
        ${escapeHtml(b.name)}
        <span class="tag">${b.type === 'expense' ? '支出' : '收入'} · ${fmt(b.amount)} · ${formatFrequency(b)}</span>
      </span>
      <span class="muted">下次：${b.next_due_date}</span>
      <label><input type="checkbox" class="bill-active-toggle" ${b.active ? 'checked' : ''} /> 启用</label>
      <button type="button" class="link-btn danger delete-bill-btn">删除</button>
    `;
    li.querySelector('.bill-active-toggle').addEventListener('change', async (e) => {
      try {
        await updateRecurringBill(b.id, { active: e.target.checked });
      } catch (err) {
        showToast('更新失败：' + err.message, true);
        e.target.checked = !e.target.checked;
      }
    });
    li.querySelector('.delete-bill-btn').addEventListener('click', async () => {
      if (!confirm('确认删除这个定时账单？已经生成的记账记录不会被删除。')) return;
      try {
        await deleteRecurringBill(b.id);
        showToast('已删除');
        await reloadBills();
      } catch (e) {
        showToast('删除失败：' + e.message, true);
      }
    });
    ul.appendChild(li);
  });
}

function wireBillForm() {
  const form = document.getElementById('add-bill-form');
  const categorySelect = form.querySelector('.category-select');
  const accountSelect = form.querySelector('.account-select');
  populateCategorySelect(categorySelect, 'expense', null);
  populateAccountSelect(accountSelect, null);
  form.querySelector('.type-select').addEventListener('change', (e) => {
    populateCategorySelect(categorySelect, e.target.value, null);
  });

  const frequencySelect = document.getElementById('bill-frequency-select');
  const dayOfMonthLabel = document.getElementById('bill-day-of-month-label');
  const dayOfWeekLabel = document.getElementById('bill-day-of-week-label');
  frequencySelect.addEventListener('change', (e) => {
    dayOfMonthLabel.hidden = e.target.value !== 'monthly';
    dayOfWeekLabel.hidden = e.target.value !== 'weekly';
  });

  form.querySelector('input[name="next_due_date"]').value = todayStr();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = fd.get('name').trim();
    if (!name) return;
    try {
      await createRecurringBill({
        name,
        type: fd.get('type'),
        amount: parseFloat(fd.get('amount')),
        category_id: fd.get('category_id') || null,
        account_id: fd.get('account_id') || null,
        frequency: fd.get('frequency'),
        day_of_week: parseInt(fd.get('day_of_week'), 10),
        day_of_month: parseInt(fd.get('day_of_month'), 10),
        next_due_date: fd.get('next_due_date'),
      });
      form.reset();
      populateCategorySelect(categorySelect, 'expense', null);
      populateAccountSelect(accountSelect, null);
      dayOfMonthLabel.hidden = false;
      dayOfWeekLabel.hidden = true;
      form.querySelector('input[name="next_due_date"]').value = todayStr();
      showToast('已添加定时账单');
      await reloadBills();
    } catch (e) {
      showToast('添加失败：' + e.message, true);
    }
  });
}

/* ================= 统计图表 ================= */

async function reloadCharts() {
  const picker = document.getElementById('chart-month-picker');
  picker.value = currentMonth;

  let transactions;
  try {
    transactions = await listTransactionsForMonth(currentMonth);
  } catch (e) {
    showToast('加载数据失败：' + e.message, true);
    return;
  }

  const expenseData = aggregateByCategory(transactions, 'expense');
  const incomeData = aggregateByCategory(transactions, 'income');
  const expenseTotal = expenseData.reduce((s, d) => s + d.total, 0);
  const incomeTotal = incomeData.reduce((s, d) => s + d.total, 0);

  document.getElementById('expense-total-label').textContent = `（合计 ${fmt(expenseTotal)}）`;
  document.getElementById('income-total-label').textContent = `（合计 ${fmt(incomeTotal)}）`;

  document.getElementById('expense-empty').hidden = expenseData.length > 0;
  document.getElementById('expense-pie').hidden = expenseData.length === 0;
  document.getElementById('income-empty').hidden = incomeData.length > 0;
  document.getElementById('income-pie').hidden = incomeData.length === 0;

  expenseChart = drawPie('expense-pie', expenseChart, expenseData);
  incomeChart = drawPie('income-pie', incomeChart, incomeData);
}

function drawPie(canvasId, existingChart, data) {
  if (existingChart) existingChart.destroy();
  if (data.length === 0) return null;
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'pie',
    data: {
      labels: data.map((d) => d.name),
      datasets: [{ data: data.map((d) => d.total), backgroundColor: data.map((d) => d.color) }],
    },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
              return `${ctx.label}: ${fmt(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function wireChartsView() {
  document.getElementById('chart-month-picker').addEventListener('change', (e) => {
    currentMonth = e.target.value;
    reloadCharts();
  });
}

/* ================= PDF 导入 ================= */

function groupTextItemsIntoLines(items) {
  const rows = [];
  const epsilon = 2;
  for (const item of items) {
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < epsilon);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) =>
    r.items.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
  );
}

async function extractTextFromPdf(arrayBuffer) {
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += groupTextItemsIntoLines(content.items).join('\n') + '\n';
  }
  return fullText;
}

function resetImportView() {
  pendingImport = null;
  document.getElementById('import-error').hidden = true;
  document.getElementById('import-success').hidden = true;
  document.getElementById('import-upload-section').hidden = false;
  document.getElementById('import-preview-section').hidden = true;
  document.getElementById('pdf-file-input').value = '';
  document.getElementById('pdf-parsing-hint').hidden = true;
}

function renderImportPreview() {
  const tbody = document.getElementById('import-preview-body');
  tbody.innerHTML = '';
  pendingImport.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="f-include" checked /></td>
      <td><input type="date" class="f-date" value="${c.date}" /></td>
      <td>
        <select class="f-type type-select">
          <option value="expense" ${c.type === 'expense' ? 'selected' : ''}>支出</option>
          <option value="income" ${c.type === 'income' ? 'selected' : ''}>收入</option>
        </select>
      </td>
      <td><select class="f-category category-select"></select></td>
      <td><select class="f-account account-select"></select></td>
      <td><input type="number" class="f-amount" step="0.01" min="0.01" value="${c.amount.toFixed(2)}" /></td>
      <td><input type="text" class="f-desc" value="${escapeHtml(c.description)}" /></td>
    `;
    const categorySelect = tr.querySelector('.f-category');
    populateCategorySelect(categorySelect, c.type, null);
    populateAccountSelect(tr.querySelector('.f-account'), null);
    tr.querySelector('.f-type').addEventListener('change', (e) => {
      populateCategorySelect(categorySelect, e.target.value, null);
    });
    tr.dataset.index = i;
    tbody.appendChild(tr);
  });
  document.getElementById('import-preview-count').textContent =
    `识别到 ${pendingImport.length} 条候选记录，请核对后确认导入。取消勾选可跳过某条记录。`;
}

function wireImportView() {
  document.getElementById('pdf-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const errorEl = document.getElementById('import-error');
    errorEl.hidden = true;
    if (!file) return;
    document.getElementById('pdf-parsing-hint').hidden = false;
    try {
      const buf = await file.arrayBuffer();
      const text = await extractTextFromPdf(buf);
      const candidates = parseStatementText(text);
      if (candidates.length === 0) {
        errorEl.textContent = '未能从该 PDF 中识别出任何交易记录，可能格式不受支持，请检查文件或尝试其他对账单。';
        errorEl.hidden = false;
        return;
      }
      pendingImport = candidates;
      renderImportPreview();
      document.getElementById('import-upload-section').hidden = true;
      document.getElementById('import-preview-section').hidden = false;
    } catch (err) {
      errorEl.textContent = '解析 PDF 失败：' + err.message;
      errorEl.hidden = false;
    } finally {
      document.getElementById('pdf-parsing-hint').hidden = true;
    }
  });

  document.getElementById('import-cancel-btn').addEventListener('click', resetImportView);

  document.getElementById('import-confirm-btn').addEventListener('click', async () => {
    const rows = [...document.getElementById('import-preview-body').querySelectorAll('tr')]
      .filter((tr) => tr.querySelector('.f-include').checked)
      .map((tr) => ({
        date: tr.querySelector('.f-date').value,
        type: tr.querySelector('.f-type').value,
        amount: parseFloat(tr.querySelector('.f-amount').value),
        category_id: tr.querySelector('.f-category').value || null,
        account_id: tr.querySelector('.f-account').value || null,
        description: tr.querySelector('.f-desc').value.trim(),
        source: 'pdf_import',
      }))
      .filter((r) => r.date && r.amount > 0);

    if (rows.length === 0) {
      showToast('没有勾选任何记录', true);
      return;
    }

    try {
      await createTransactionsBulk(rows);
      resetImportView();
      location.hash = '#/transactions';
      handleRoute();
      showToast(`成功导入 ${rows.length} 条记录`);
    } catch (e) {
      document.getElementById('import-error').textContent = '导入失败：' + e.message;
      document.getElementById('import-error').hidden = false;
    }
  });
}

/* ================= 启动 ================= */

function init() {
  wireAuthForms();
  wireConfigForm();
  wireTransactionForm();
  wireAccountForm();
  wireBillForm();
  wireCategoryForm();
  wireChartsView();
  wireImportView();
  window.addEventListener('hashchange', handleRoute);

  if ('serviceWorker' in navigator) {
    // updateViaCache: 'none' 让浏览器每次都用网络请求校验 sw.js 本身有没有更新，
    // 不然 sw.js 可能被 HTTP 缓存卡住，网站更新了却一直用旧的 service worker。
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
      // 离线支持是增强功能，注册失败不影响正常使用
    });
  }

  if (isLoggedIn()) {
    showApp();
  } else {
    showAuth();
  }
}

document.addEventListener('DOMContentLoaded', init);
