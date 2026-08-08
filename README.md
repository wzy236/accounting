# 记账本

一个纯静态的个人记账网站：记录每日收支、自定义分类、饼图统计、支持导入银行 PDF 对账单。可以直接托管在 GitHub Pages，安装到手机桌面当 PWA 用。

## 技术栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 托管 | GitHub Pages | 静态文件，从 `docs/` 目录部署 |
| 数据库 / 认证 | Supabase | PostgreSQL + Auth，前端直接用 `fetch` 调 REST API，不用 SDK |
| 前端 | 纯 HTML + CSS + JS | 无框架，`docs/index.html` 单页应用，hash 路由 |
| 图表 | Chart.js | 本地 vendor（`docs/vendor/chart.umd.min.js`），不依赖 CDN |
| PDF 解析 | pdf.js | 本地 vendor，浏览器端解析，PDF 不会上传到任何服务器 |
| 离线 | Service Worker | app shell 走 cache-first，Supabase 请求走 network-first |
| PWA | manifest.json | 可安装到手机/桌面 |

## 上线步骤

### 1. 建 Supabase 数据库

打开你的 Supabase 项目 → **SQL Editor** → 新建查询 → 粘贴 [`sql/schema.sql`](sql/schema.sql) 的全部内容 → Run。

这一步会创建 `categories`（分类）和 `transactions`（交易记录）两张表，并开启 **Row Level Security**（每个用户通过 REST API 只能读写自己的数据，即使 anon key 是公开的也不会泄露别人的数据）。

### 2. 确认 Auth 邮箱设置

Supabase 项目 → **Authentication → Providers → Email**：
- 如果关掉"Confirm email"，注册后会直接登录。
- 如果开着（默认开着），注册后需要去邮箱点确认链接才能登录，页面会提示"请前往邮箱完成确认"。

### 3. 配置前端连接的 Supabase 项目

`docs/js/config.js` 里已经填好了当前项目的 URL 和 anon key。如果要换成别的 Supabase 项目，改这两个值即可：

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'xxxx';
```

> anon key 设计上就是公开的（本来就会被打进前端代码里），真正的数据安全依赖第 1 步开启的 RLS 策略，**千万不要把 `service_role` key 放到前端**。

### 4. 开启 GitHub Pages

仓库 Settings → Pages → Source 选择 `Deploy from a branch` → Branch 选 `main`（或本 PR 合并后所在分支）、目录选 `/docs` → Save。几分钟后即可通过 `https://<你的用户名>.github.io/<仓库名>/` 访问。

### 本地预览

不需要装任何依赖，随便起一个静态文件服务器指向 `docs/` 目录即可，例如：

```bash
python3 -m http.server 8080 --directory docs
```

然后打开 `http://localhost:8080`。（直接用 `file://` 双击打开 `index.html` 也基本能用，但 Service Worker 在部分浏览器下需要 http(s) 协议才能注册。）

## 功能

- 邮箱注册 / 登录（Supabase Auth），每个用户独立账本，数据存 Supabase 的 Postgres
- 手动记录收入/支出，日期、金额、备注
- 自定义收入/支出分类（含颜色标记），首次登录自动写入一套默认分类
- 按月查看收支明细、编辑、删除
- 按月饼图统计（支出/收入分别按分类展示）
- 上传银行 PDF 对账单，浏览器本地用 pdf.js 提取文本并识别候选交易记录，预览核对后批量导入
- 离线可用 app 外壳（Service Worker 缓存静态资源），可安装为 PWA

## PDF 导入说明

PDF 解析（`docs/js/bankStatementParser.js`）基于常见对账单格式的启发式规则（识别行内的日期 + 金额），全部在浏览器本地完成，**不保证 100% 准确**，尤其是：

- 日期格式支持 `YYYY-MM-DD`、`MM/DD/YYYY`、`YYYY年MM月DD日`
- 金额必须包含两位小数（如 `12.34`），带千分位逗号、`$`/`¥` 符号、括号或前后负号均可识别为负数（支出）
- 若一行有多个金额（例如金额 + 余额两列），默认取第一个作为交易金额

导入前会展示预览表格，可逐条修改日期/金额/类型/分类/描述，或取消勾选跳过某条记录，确认后才会写入数据库。

## 目录结构

```
docs/                   # GitHub Pages 发布目录
  index.html            # 单页应用：登录/注册 + 记账/分类/图表/导入
  css/style.css
  js/
    config.js            # Supabase 项目配置
    supabaseClient.js     # Auth + REST 请求封装（纯 fetch）
    api.js                 # categories/transactions 业务接口
    bankStatementParser.js # PDF 文本 -> 候选交易记录
    app.js                  # 页面逻辑、路由、渲染
  vendor/                # 本地打包的 chart.js、pdf.js（不依赖 CDN）
  icons/                 # PWA 图标
  manifest.json
  sw.js                  # Service Worker
sql/schema.sql          # Supabase 建表 + RLS 策略
```
