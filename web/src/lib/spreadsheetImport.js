import * as XLSX from 'xlsx';
import { extractDate, parseLine } from './bankStatementParser.js';

/** 极简 CSV 解析：支持带引号的字段（内部逗号/换行/转义引号），不依赖任何第三方库。 */
function parseCsvRows(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // Excel 另存的 UTF-8 CSV 开头带 BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Excel 数字单元格默认按“通用格式”显示，128.50 会被读成 "128.5"、9000.00 会被读成 "9000"，
// 末尾的 0 丢了就不满足解析规则里“金额必须两位小数”的要求。这里把看起来是纯数字的单元格
// 补齐成两位小数；日期、描述这些非纯数字的文本原样保留，不受影响。
function normalizeCell(value) {
  const s = String(value ?? '').trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s).toFixed(2) : s;
}

/** 把表格的每一行拼成一句话，复用 PDF 解析里那套“识别日期+金额”的规则。 */
function candidatesFromRows(rows) {
  const candidates = [];
  for (const row of rows) {
    const line = row.map(normalizeCell).filter(Boolean).join(' ');
    if (!line) continue;
    const candidate = parseLine(line);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

// ---- 有表头的表格：按列名取值 ----
// 别名统一按小写比较，常见的中文和加拿大银行导出的英文列名都收进来。
const COLUMN_ALIASES = {
  date: ['日期', '交易日期', '记账日期', 'date', 'transaction date', 'trans date', 'posted date', 'posting date'],
  description: ['描述', '摘要', '说明', '备注', '交易描述', 'description', 'details', 'memo', 'payee', 'merchant'],
  amount: ['金额', '交易金额', 'amount'],
  expense: ['支出', '支出金额', 'debit', 'withdrawal', 'withdrawals', 'money out'],
  income: ['收入', '收入金额', 'credit', 'deposit', 'deposits', 'money in'],
  type: ['类型', '收支', '收支类型', 'type'],
  category: ['分类', '类别', 'category'],
  subcategory: ['子分类', '二级分类', 'subcategory'],
  account: ['账户', 'account'],
};

const normalizeHeader = (cell) => String(cell ?? '').replace(/^\uFEFF/, '').trim().toLowerCase();

/** 在前几行里找表头（有的银行导出前面还有几行标题），至少要有日期列和金额列（或支出/收入列）。 */
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map(normalizeHeader);
    const columns = {};
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      const index = cells.findIndex((c) => aliases.includes(c));
      if (index !== -1) columns[key] = index;
    }
    const hasAmount = columns.amount !== undefined || columns.expense !== undefined || columns.income !== undefined;
    if (columns.date !== undefined && hasAmount) return { index: i, columns };
  }
  return null;
}

/** 金额单元格：列已经确定了，就不要求两位小数；负号（前后都行）或括号算负数，货币符号和千分位逗号忽略。 */
function parseAmountCell(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n === 0) return null;
  const negative = /^\(.*\)$/.test(s) || /^[^\d]*[-−]/.test(s) || /[-−]\s*$/.test(s);
  return { value: Math.round(n * 100) / 100, negative };
}

function typeFromCell(value) {
  const s = normalizeHeader(value);
  if (/收入|income|credit|deposit/.test(s)) return 'income';
  if (/支出|expense|debit|withdraw/.test(s)) return 'expense';
  return null;
}

function candidateFromColumns(row, columns) {
  const cell = (key) => (columns[key] === undefined ? '' : String(row[columns[key]] ?? '').trim());
  const date = extractDate(cell('date'))?.dateStr;
  if (!date) return null;

  let parsed = null;
  let type = null;
  if (columns.amount !== undefined) {
    parsed = parseAmountCell(cell('amount'));
    if (parsed) type = parsed.negative ? 'expense' : 'income';
  } else {
    const out = parseAmountCell(cell('expense'));
    const inc = parseAmountCell(cell('income'));
    parsed = out || inc;
    type = out ? 'expense' : 'income';
  }
  if (!parsed) return null;

  return {
    date,
    description: cell('description').slice(0, 200),
    amount: parsed.value,
    type: typeFromCell(cell('type')) || type,
    categoryName: cell('category'),
    subcategoryName: cell('subcategory'),
    accountName: cell('account'),
  };
}

/** 有表头就按列取；没有表头就沿用逐行“找日期 + 两位小数金额”的规则（和 PDF 一样）。 */
function candidatesFromTable(rows) {
  const header = findHeader(rows);
  if (!header) return candidatesFromRows(rows);
  return rows.slice(header.index + 1).map((row) => candidateFromColumns(row, header.columns)).filter(Boolean);
}

export function extractCandidatesFromCsv(text) {
  return candidatesFromTable(parseCsvRows(text));
}

/** 解析 .xlsx / .xls，用 npm 的 xlsx（SheetJS）包，Vite 打包进产物里，不联网。 */
export function extractCandidatesFromExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellNF: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // 日期单元格不管设成什么显示格式（默认是 10/5/26 这种两位年份，识别不了），都统一转成 2026-10-05
  for (const [ref, cell] of Object.entries(sheet)) {
    if (ref[0] !== '!' && cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
      cell.w = XLSX.SSF.format('yyyy-mm-dd', cell.v);
    }
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  return candidatesFromTable(rows);
}
