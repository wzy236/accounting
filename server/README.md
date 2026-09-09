# accounting-server

这里只放一件静态网站做不到的事的逻辑：**定时账单真正按时自动生成**。没有常驻的 Express/HTTP 服务——真正触发它跑起来的是仓库里的 [`.github/workflows/run-recurring-bills.yml`](../.github/workflows/run-recurring-bills.yml)，每天定时临时起一台 GitHub Actions 的机器，跑一次 [`src/runOnce.js`](src/runOnce.js) 就销毁，不需要你自己开服务器、不用管休眠/容量不足这些问题。

其它所有功能（登录注册、记账、账户、分类、统计图表）`web/` 前端还是直连 Supabase，靠 RLS 保证数据隔离，跟这个目录没关系——这不是漏做，是故意的：Supabase 的 REST API（PostgREST）本身已经是一套现成、安全的接口，没必要在后端重新实现一遍增删改查再转发一次。

## 怎么让它真正跑起来

1. 去 Supabase 后台 **Project Settings → API**，复制 **service_role key**（不是 anon/publishable key，权限完全不同）
2. 去 GitHub 仓库 **Settings → Secrets and variables → Actions**，加两个 **Repository secret**：
   - `SUPABASE_URL`：你的 Supabase 项目地址
   - `SUPABASE_SERVICE_ROLE_KEY`：上一步复制的 key

配完这两个 secret，`run-recurring-bills.yml` 就会每天 00:10（UTC）自动跑一次；也可以去仓库 **Actions** 标签页手动点 **Run workflow** 立刻测一次，不用等到点。

> `service_role` key 权限极高，能绕过 RLS 读写所有用户的数据，**只能存成 GitHub secret，绝对不能写进代码、不能提交进仓库、也不能给前端用**。

## 本地开发/调试

```bash
cd server
npm install
cp .env.example .env   # 填好 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
npm run sweep
```

## 文件说明

- `src/recurringBills.js` —— 真正的扫描逻辑：用 service_role key 一次性查全部用户的 `recurring_bills`，把到期的都生成对应的 `transactions` 记录，推进 `next_due_date`
- `src/supabaseAdmin.js` —— 建一个用 service_role key 认证的 supabase-js client
- `src/runOnce.js` —— 跑一次上面那个扫描逻辑就退出，GitHub Actions 和本地调试都是跑这个文件

`web/` 那边打开网站时也还留了一份客户端兜底逻辑（`generateDueRecurringTransactions`），万一这个定时任务哪天没跑成功，打开网站还能补上。
