import { createTheme } from '@mantine/core';

// 参照 Money Manager（Realbyte）的配色：珊瑚红做主色/支出色，蓝色表示收入。
export const INCOME_COLOR = '#2f7ee6';
export const EXPENSE_COLOR = '#f25a5a';

export const theme = createTheme({
  primaryColor: 'coral',
  primaryShade: 6,
  colors: {
    coral: ['#fff0f0', '#ffe1e1', '#fdc1c1', '#fa9d9d', '#f77f7f', '#f46b6b', '#f25a5a', '#d84a4a', '#c04141', '#a63535'],
  },
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Roboto, sans-serif',
  headings: { fontWeight: '700' },
  defaultRadius: 'md',
  cursorType: 'pointer',
});
