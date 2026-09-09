# 记账本

一个个人记账网站：记录每日收支、自定义分类（支持子分类）、多账户余额、账户间转账、按天/周/月的定时账单、饼图统计、支持导入银行 PDF/Excel/CSV 对账单。数据存 Supabase，登录后每个人只能看到自己的账本。

## 这几个目录是什么关系

- **[`web/`](web)** —— 现在的主力前端，React（Vite 打包）。界面重写过，但数据层原理没变：浏览器直连 Supabase，登录和数据权限都靠 Supabase Auth + 数据库的 **Row Level Security** 保证，没有经过任何后端转发
- **[`legacy-static/`](legacy-static)** —— 早期的纯 HTML/CSS/原生 JS 版本，功能上跟 `web/` 对等，保留下来当参考/备用，目前没有部署
- **[`server/`](server)** —— 只做一件浏览器做不到的事：**定时账单真正按时自动生成**。没有常驻服务器，靠 GitHub Actions 定时跑一个脚本，具体看 [`server/README.md`](server/README.md)
- **[`sql/schema.sql`](sql/schema.sql)** —— 两套前端共用同一份数据库结构

## 上线步骤

### 1. 建 Supabase 数据库

打开你的 Supabase 项目 → **SQL Editor** → 新建查询 → 粘贴 [`sql/schema.sql`](sql/schema.sql) 的全部内容 → Run。

这一步会创建 `categories`（分类）、`transactions`（交易记录）、`accounts`（银行账户/信用卡）、`recurring_bills`（定时账单）四张表，并开启 **Row Level Security**（每个用户通过 REST API 只能读写自己的数据，即使 anon key 是公开的也不会泄露别人的数据）。重复执行是安全的，已经跑过旧版的项目再跑一次会自动补上新增的表和列。

### 2. 确认 Auth 邮箱设置

Supabase 项目 → **Authentication → Providers → Email**：
- 如果关掉"Confirm email"，注册后会直接登录。
- 如果开着（默认开着），注册后需要去邮箱点确认链接才能登录，页面会提示"请前往邮箱完成确认"。

### 3. 配置前端连接的 Supabase 项目

`web/src/lib/config.js` 里已经填好了默认项目的 URL 和 anon/publishable key。如果要换成自己的 Supabase 项目，不需要改代码——打开网站，登录页底部或登录后顶部导航都有「Supabase 设置」入口，直接粘贴自己项目的 URL + key，保存后只存在当前浏览器的 `localStorage` 里，不影响默认配置和其他访问者。也可以直接改 `web/src/lib/config.js` 里的默认值。

> anon/publishable key 设计上就是公开的（本来就会被打进前端代码里），真正的数据安全依赖第 1 步开启的 RLS 策略，**千万不要把 `service_role` key 放到前端**。

### 4. 开启 GitHub Pages（部署 `web/`）

跟以前"选个分支和目录"不一样，现在是让 GitHub Actions 帮你构建再发布：

1. 仓库 **Settings → Pages → Build and deployment → Source**，选 **GitHub Actions**（不是 `Deploy from a branch`）
2. 推送/合并到 `main` 分支时，[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) 会自动构建 `web/` 并发布，几分钟后就能通过 `https://<你的用户名>.github.io/<仓库名>/` 访问
3. 也可以去仓库 **Actions** 标签页手动点这个 workflow 的 **Run workflow** 立刻触发一次

### 5. 配置定时账单的真实定时任务

见 [`server/README.md`](server/README.md)——需要在仓库 Secrets 里配两个值（Supabase URL + service_role key）。这一步是可选的：不配的话，定时账单仍然会在你打开网站时自动"补课"，只是不会精确到具体时间点。

### 本地开发

```bash
cd web
npm install
npm run dev
```

## 功能

- 邮箱注册 / 登录（Supabase Auth），每个用户独立账本
- 手动记录收入/支出，日期、金额、备注
- 自定义收入/支出分类（含颜色标记），首次登录自动写入一套默认分类；支出分类可以再加一层子分类
- 按月查看收支明细、编辑、删除，可关联到某个账户
- 按月饼图统计（支出/收入分别按分类展示）
- 上传银行/信用卡对账单（PDF、Excel .xlsx/.xls 或 CSV），浏览器本地识别候选交易记录，预览核对后批量导入
- **账户管理**：添加多个银行账户/信用卡，自动按「初始余额 + 关联交易的收支」算出当前余额（信用卡欠款显示为负数）；随时可以"调整余额"，系统会自动补一笔差额的收入/支出记录，而不是直接改数字，保证余额变动都能在记账记录里查到
- **转账**：在自己的账户之间转移资金（比如还信用卡欠款），记成一对收入/支出记录但不计入月度收入/支出统计和饼图，只影响账户余额
- **定时账单**：设置按天/周/月重复的账单（房租、信用卡还款等），[`server/`](server) 里的 GitHub Actions 定时任务会按真实时间表自动生成交易；打开网站时也会顺手补一次，双重保险
- 可安装为 PWA，离线也能打开 app 外壳

## Supabase 免费版会自动暂停

Supabase 免费版项目连续 7 天没有 API 请求会自动暂停（打开网站报 `Failed to fetch` 大概率就是这个）。仓库里的 [`.github/workflows/keep-supabase-awake.yml`](.github/workflows/keep-supabase-awake.yml) 会每 3 天自动请求一次 Supabase 接口防止暂停。如果项目已经被暂停了，还是要先去 Supabase 后台手动点一次 **Restore** 才能恢复。

## 对账单导入说明

支持 PDF、Excel（`.xlsx`/`.xls`）、CSV 三种格式，识别规则是同一套（`bankStatementParser.js` 里的 `parseLine`）：PDF 先提取每页文字按行处理，Excel/CSV 则是把每一行的单元格拼成一句话，再统一识别行内的日期 + 金额。全部在浏览器本地完成，不会上传到任何服务器，但**不保证 100% 准确**，尤其是：

- 日期格式支持 `YYYY-MM-DD`、`MM/DD/YYYY`、`YYYY年MM月DD日`
- 金额必须包含两位小数（如 `12.34`），带千分位逗号、`$`/`¥` 符号、括号或前后负号均可识别为负数（支出）；Excel 里数字单元格如果显示成 `9000`（没有 `.00`），会先自动补成两位小数再识别
- 若一行有多个金额（例如金额 + 余额两列），默认取第一个作为交易金额

导入前会展示预览表格，可逐条修改日期/金额/类型/分类/描述，或取消勾选跳过某条记录，确认后才会写入数据库。

## 目录结构

```
web/                    # React 前端（现在的部署目标）
  src/
    lib/                # Supabase client、业务接口、格式化工具、PDF/Excel/CSV 解析
    components/         # 复用组件
    pages/              # 各个页面
  vite.config.js        # vite-plugin-pwa 配置
legacy-static/          # 早期纯 HTML/CSS/原生 JS 版本，保留参考，未部署
server/                 # 定时账单真实定时任务用到的脚本
sql/schema.sql          # Supabase 建表 + RLS 策略
.github/workflows/
  deploy-pages.yml         # 构建 web/ 发布到 GitHub Pages
  run-recurring-bills.yml  # 定时跑 server/ 的账单扫描脚本
  keep-supabase-awake.yml  # 防止 Supabase 项目被自动暂停
```
