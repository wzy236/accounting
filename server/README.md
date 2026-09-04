# accounting-server

这个后端只做一件静态网站做不到的事：**定时账单真正按时自动生成**（不用等谁打开网站才补课）。

其它所有功能（登录注册、记账、账户、分类、统计图表）`web/` 前端还是直连 Supabase，靠 RLS 保证数据隔离，没有经过这个后端——这不是漏做，是故意的：Supabase 的 REST API（PostgREST）本身已经是一套现成、安全的接口，没必要在后端重新实现一遍增删改查再转发一次。

## 本地开发

```bash
cd server
npm install
cp .env.example .env   # 填好 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / CRON_SECRET
npm start
```

`SUPABASE_SERVICE_ROLE_KEY` 在 Supabase 后台 **Project Settings → API** 页面能找到。这个 key 权限极高，能绕过 RLS 读写所有用户的数据，**只能放在这个后端的环境变量里，绝对不能给前端用、不能提交进仓库**（`.env` 已经在 `.gitignore` 里）。

## 接口

- `GET /health` — 存活检查
- `POST /api/recurring-bills/run` — 扫一遍全部用户到期的定时账单并生成交易记录；需要带 header `x-cron-secret: <你在 .env 里设的 CRON_SECRET>`，没带或不对返回 401

## 定时怎么触发

代码里已经用 `node-cron` 注册了每天 00:10 跑一次，**但这只在进程一直存活的部署方式下才准时**：

- 部署在一直运行的服务器/VPS 上：什么都不用配，内部这个 cron 自己就会跑
- 部署在会休眠的免费平台（比如 Render 的免费 Web Service，闲置一段时间会自动睡眠）：内部 cron 睡着的时候不会触发，需要靠**外部**定时器把它叫醒——比如加一个 GitHub Actions scheduled workflow，每天定时 `curl -X POST https://你的后端地址/api/recurring-bills/run -H "x-cron-secret: ..."`，跟仓库里 `.github/workflows/keep-supabase-awake.yml` 保活 Supabase 的思路一样，`CRON_SECRET` 存成 GitHub Actions 的 secret，不要直接写进 workflow 文件里

两种方式可以同时留着，互为兜底。前端 `web/` 那边打开网站时也还留了一份客户端兜底逻辑（`generateDueRecurringTransactions`），三层保险叠在一起，基本不会漏算账单。

## 部署到哪

不需要自己管数据库，只需要能跑 Node.js 的地方就行，比如：

- **Render**（免费 Web Service）：连上这个仓库，Root Directory 填 `server`，Build Command `npm install`，Start Command `npm start`，把 `.env.example` 里那几个变量配成 Environment Variables。免费档闲置会休眠，务必按上面说的加外部定时器叫醒
- 任何你自己的服务器/VPS：`npm install && npm start`，用 `pm2`/`systemd` 保活
