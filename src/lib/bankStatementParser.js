const dayjs = require('dayjs');

// 常见对账单日期格式：2024-01-15 / 01/15/2024 / 01-15-2024 / 2024年1月15日
const DATE_PATTERNS = [
  { re: /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/, order: ['y', 'm', 'd'] },
  { re: /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/, order: ['m', 'd', 'y'] },
  { re: /(\d{4})年(\d{1,2})月(\d{1,2})日/, order: ['y', 'm', 'd'] },
];

// 金额：要求必须带两位小数（对账单金额惯例），避免把编号/流水号误判为金额
// 可带 $ / ¥ 符号、千分位逗号；支持前置负号、末尾负号、括号表示负数
const AMOUNT_RE = /[(-]?[$¥]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?-?/g;

function extractDate(line) {
  for (const { re, order } of DATE_PATTERNS) {
    const m = line.match(re);
    if (!m) continue;
    const parts = {};
    order.forEach((key, i) => (parts[key] = m[i + 1]));
    let year = parts.y;
    if (year.length === 2) year = (Number(year) > 70 ? '19' : '20') + year;
    const date = dayjs(`${year}-${parts.m.padStart(2, '0')}-${parts.d.padStart(2, '0')}`, 'YYYY-MM-DD', true);
    if (date.isValid()) {
      return { dateStr: date.format('YYYY-MM-DD'), matchText: m[0], index: m.index };
    }
  }
  return null;
}

function parseAmountToken(token) {
  const negative = /^\(.*\)$/.test(token) || token.startsWith('-') || token.endsWith('-');
  const cleaned = token.replace(/[()$¥,\-]/g, '');
  const value = parseFloat(cleaned);
  if (Number.isNaN(value)) return null;
  return { value: Math.abs(value), negative };
}

function extractAmounts(line) {
  const matches = [...line.matchAll(AMOUNT_RE)]
    .map((m) => ({ token: m[0], index: m.index }))
    .filter((m) => /\d/.test(m.token) && m.token.replace(/[^\d]/g, '').length > 0);
  return matches
    .map((m) => {
      const parsed = parseAmountToken(m.token);
      return parsed ? { ...parsed, index: m.index, token: m.token } : null;
    })
    .filter(Boolean);
}

/**
 * 从对账单纯文本中提取候选交易记录（启发式规则，非精确解析，需人工核对）。
 * 每行若能同时匹配到日期和金额，则视为一条候选交易；
 * 描述取日期与金额之间的文本；金额为负（负号/括号/末尾负号）判定为支出，否则为收入。
 */
function parseStatementText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const candidates = [];

  for (const line of lines) {
    const dateMatch = extractDate(line);
    if (!dateMatch) continue;

    const amounts = extractAmounts(line);
    if (amounts.length === 0) continue;

    // 排除日期字符串本身被误判为金额的情况
    const realAmounts = amounts.filter(
      (a) => a.index < dateMatch.index || a.index >= dateMatch.index + dateMatch.matchText.length
    );
    if (realAmounts.length === 0) continue;

    // 取第一个候选金额列（多列对账单常见顺序：金额、余额）
    const amountInfo = realAmounts[0];
    if (amountInfo.value === 0) continue;

    const dateEnd = dateMatch.index + dateMatch.matchText.length;
    const descStart = Math.min(dateEnd, amountInfo.index);
    const descEnd = Math.max(dateEnd, amountInfo.index);
    let description = line.slice(descStart, descEnd).replace(/^[\s,:|.\-]+|[\s,:|.\-]+$/g, '');
    if (!description) description = line.slice(0, 60);

    candidates.push({
      date: dateMatch.dateStr,
      description: description.slice(0, 200),
      amount: amountInfo.value,
      type: amountInfo.negative ? 'expense' : 'income',
    });
  }

  return candidates;
}

module.exports = { parseStatementText };
