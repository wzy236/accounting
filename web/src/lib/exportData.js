// 导出分类和账户：生成 CSV 和一段方便复制粘贴的文字。
import { buildCategoryTree } from './format.js';

const TYPES = [['expense', '支出'], ['income', '收入']];
const ACCOUNT_TYPE_LABEL = { bank: '银行账户', credit_card: '信用卡' };

const csvField = (value) => {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';

/** 每个分类一行（大类一行、每个子分类一行），列名和导入用的 CSV 一致。 */
export function categoriesCsv(categories) {
  const rows = [['类型', '分类', '子分类']];
  for (const [type, label] of TYPES) {
    let top = null;
    for (const { cat, depth } of buildCategoryTree(categories.filter((c) => c.type === type))) {
      if (depth === 0) top = cat;
      rows.push([label, top.name, depth === 0 ? '' : cat.name]);
    }
  }
  return toCsv(rows);
}

export function accountsCsv(accounts) {
  const rows = [['名称', '类型', '币种', '当前余额']];
  for (const a of accounts) {
    rows.push([a.name, ACCOUNT_TYPE_LABEL[a.type] ?? a.type, a.currency || 'CAD', Number(a.balance ?? 0).toFixed(2)]);
  }
  return toCsv(rows);
}

/** 一段纯文字（不含余额），方便直接复制发给别人，比如让 Claude 按你的分类整理账单。 */
export function summaryText(categories, accounts) {
  const parts = [];
  for (const [type, label] of TYPES) {
    const groups = [];
    for (const { cat, depth } of buildCategoryTree(categories.filter((c) => c.type === type))) {
      if (depth === 0) groups.push({ name: cat.name, children: [] });
      else groups[groups.length - 1].children.push(cat.name);
    }
    const lines = groups.map((g) => (g.children.length ? `${g.name}：${g.children.join('、')}` : g.name));
    parts.push(`${label}分类：\n${lines.join('\n') || '（无）'}`);
  }
  const accountLines = accounts.map((a) => `${a.name}（${ACCOUNT_TYPE_LABEL[a.type] ?? a.type}，${a.currency || 'CAD'}）`);
  parts.push(`账户：\n${accountLines.join('\n') || '（无）'}`);
  return parts.join('\n\n');
}

/** 下载 CSV；开头加 BOM，Excel 打开中文才不会乱码。 */
export function downloadCsv(filename, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
