# web（React 版前端）

现在的主力前端，功能上跟 `legacy-static/` 那套纯静态 HTML/JS 版本完全对齐（记账、账户余额、账户间转账、定时账单、支出子分类、饼图统计、PDF/Excel/CSV 导入、PWA），只是用 React + Vite 重写了一遍界面。数据层的原理没变：前端直连 Supabase，登录状态和数据权限都靠 Supabase Auth + 数据库的 RLS 策略保证。

界面用 [Mantine](https://mantine.dev) 组件库 + [Tabler Icons](https://tabler.io/icons)，交互参照 Money Manager（Realbyte）：手机上是底部「记账 / 统计 / 账户 / 更多」四个标签 + 右下角红色 + 号记一笔，记账页有按天分组的列表和月历两种视图；电脑上换成左侧边栏，记一笔从右边滑出。主色是珊瑚红（支出），收入用蓝色，主题定义在 `src/theme.js`，自定义样式在 `src/app.css`。

跟纯静态版本唯一不同的是：定时账单除了前端"打开网站补课"这层兜底之外，[`server/`](../server) 目录还有个脚本会被 GitHub Actions 按真正的时间表定时触发，自动生成到期账单，不需要谁专门打开网站。

## 本地开发

```bash
cd web
npm install
npm run dev
```

首次打开会用仓库里内置的默认 Supabase 项目；如果想换成自己的项目，打开网站后在登录页、手机端「更多」或电脑端侧边栏找"Supabase 设置"，粘贴自己项目的 URL + anon/publishable key 即可（存在浏览器 localStorage，不需要改代码）。

数据库表结构用根目录 [`sql/schema.sql`](../sql/schema.sql)，在 Supabase 后台的 SQL Editor 里跑一次即可。

## 构建 & 部署

```bash
npm run build
```

产物在 `web/dist/`，是纯静态文件（`base: './'` 用的是相对路径，部署到任何子路径下都能用）。仓库里 [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) 已经配好了：推送到 `main` 时自动跑这个 build 并发布到 GitHub Pages（前提是仓库 Settings → Pages → Source 选的是 **GitHub Actions**）。如果想部署到别的静态托管（Vercel、Netlify 等），直接把 `web/dist/` 传上去就行。

## 目录结构

```
web/
  src/
    lib/
      config.js            # Supabase 项目配置（默认值 + localStorage 自定义覆盖）
      SupabaseContext.jsx  # 建 supabase-js client、管理登录 session
      DataContext.jsx      # 登录后共享的分类/账户数据，进来时顺带跑一次"定时账单补课"
      toast.js / confirm.jsx  # 提示条（Mantine notifications）和确认弹窗（Mantine modals）
      api.js               # 分类/记账/账户/转账/定时账单的业务接口（supabase-js 查询构造器）
      format.js            # 日期/金额格式化、分类树形展开
      txGroups.js          # 按天分组、收支合计
      currency.js          # 多币种实时汇率
      bankStatementParser.js / pdfExtract.js / spreadsheetImport.js  # PDF/Excel/CSV 对账单解析
    components/
      Layout.jsx           # 电脑端侧边栏 + 手机端底部标签栏
      PageHeader.jsx       # 顶部标题栏 + 月份/日期切换
      TransactionDrawer.jsx  # 记一笔 / 编辑 / 转账的抽屉表单
      TransactionList.jsx  # 按天分组的列表、月历、收支汇总条
      CategoryPicker.jsx   # 分类格子选择（带子分类）
    pages/                 # 记账、统计、账户、更多、分类管理、定时账单、导入对账单、登录、设置
    theme.js / app.css     # Mantine 主题和自定义样式
  vite.config.js           # vite-plugin-pwa 配置（manifest + service worker）
```
