import { parseLine } from './bankStatementParser.js';

/** 极简 CSV 解析：支持带引号的字段（内部逗号/换行/转义引号），不依赖任何第三方库。 */
function parseCsvRows(text) {
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

export function extractCandidatesFromCsv(text) {
  return candidatesFromRows(parseCsvRows(text));
}

/** 解析 .xlsx / .xls，用的是本地 vendor 的 SheetJS（docs/vendor/xlsx.core.min.js），不联网。 */
export function extractCandidatesFromExcel(arrayBuffer) {
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  return candidatesFromRows(rows);
}
