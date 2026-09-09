// 跑一次定时账单扫描就退出。本地开发用 `npm run sweep`（会读 .env）；
// GitHub Actions 里直接 `node src/runOnce.js`，环境变量从 workflow 的 secrets 注入。
import 'dotenv/config';
import { createServiceClient } from './supabaseAdmin.js';
import { runRecurringBillsSweep } from './recurringBills.js';

const client = createServiceClient();
const generated = await runRecurringBillsSweep(client);
console.log(`[recurring-bills] 生成了 ${generated} 笔交易`);
