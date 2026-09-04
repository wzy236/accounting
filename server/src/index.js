import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { createServiceClient } from './supabaseAdmin.js';
import { runRecurringBillsSweep } from './recurringBills.js';

const app = express();
const PORT = process.env.PORT || 3000;
const CRON_SECRET = process.env.CRON_SECRET;

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

async function sweepOnce(label) {
  try {
    const client = createServiceClient();
    const generated = await runRecurringBillsSweep(client);
    console.log(`[recurring-bills] (${label}) 生成了 ${generated} 笔交易`);
    return { ok: true, generated };
  } catch (err) {
    console.error(`[recurring-bills] (${label}) 出错`, err);
    return { ok: false, error: err.message };
  }
}

// 手动/外部触发的入口：部署在会休眠的免费平台时，靠外部定时器（比如 GitHub Actions
// 的 schedule workflow）定期 POST 这个接口来触发扫描；部署在一直运行的服务器上，
// 下面的内部 node-cron 已经够用，这个接口权当兜底和手动测试用。
app.post('/api/recurring-bills/run', async (req, res) => {
  if (!CRON_SECRET || req.get('x-cron-secret') !== CRON_SECRET) {
    return res.status(401).json({ ok: false, error: '缺少或错误的 x-cron-secret' });
  }
  const result = await sweepOnce('http-trigger');
  res.status(result.ok ? 200 : 500).json(result);
});

// 每天 00:10 跑一次；只有在进程一直存活的部署方式下才会准时触发。
cron.schedule('10 0 * * *', () => sweepOnce('internal-cron'));

app.listen(PORT, () => {
  console.log(`accounting-server listening on :${PORT}`);
});
