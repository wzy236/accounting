-- 记账本 Supabase 数据库结构
-- 使用方法：打开 Supabase 项目 -> SQL Editor -> 新建查询 -> 粘贴本文件全部内容 -> Run
-- 只需要执行一次。重复执行是安全的（用了 IF NOT EXISTS / OR REPLACE）。

create extension if not exists pgcrypto;

-- ========== 分类表 ==========
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income','expense')),
  color text not null default '#888888',
  created_at timestamptz not null default now(),
  unique (user_id, name, type)
);

-- ========== 交易记录表 ==========
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  description text not null default '',
  source text not null default 'manual' check (source in ('manual','pdf_import')),
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_date on public.transactions (user_id, date);
create index if not exists idx_categories_user on public.categories (user_id, type);

-- ========== 行级安全策略（RLS）==========
-- 关键：开启后，每个用户通过 REST API 只能看到/修改自己的数据，
-- 即使 anon key 是公开的（写在前端代码里）也不会泄露别人的数据。
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- ========== 账户表（银行卡 / 信用卡）==========
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('bank','credit_card')),
  initial_balance numeric(12,2) not null default 0,
  color text not null default '#3d5a80',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists idx_accounts_user on public.accounts (user_id);

alter table public.accounts enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own" on public.accounts
  for select using (auth.uid() = user_id);

drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own" on public.accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own" on public.accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own" on public.accounts
  for delete using (auth.uid() = user_id);

-- 交易记录关联账户（可选，不选则不计入任何账户余额）
alter table public.transactions
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists idx_transactions_account on public.transactions (account_id);

-- 定时账单自动生成的交易记录也算一种来源
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check
  check (source in ('manual','pdf_import','recurring'));

-- ========== 定时账单表 ==========
-- frequency = 'daily'：每天；'weekly'：按 day_of_week（0=周日...6=周六）；'monthly'：按 day_of_month（超过当月天数自动取当月最后一天）。
create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  day_of_week int check (day_of_week between 0 and 6),
  day_of_month int check (day_of_month between 1 and 31),
  next_due_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (frequency <> 'weekly' or day_of_week is not null),
  check (frequency <> 'monthly' or day_of_month is not null)
);

create index if not exists idx_recurring_bills_user on public.recurring_bills (user_id, active);

alter table public.recurring_bills enable row level security;

drop policy if exists "recurring_bills_select_own" on public.recurring_bills;
create policy "recurring_bills_select_own" on public.recurring_bills
  for select using (auth.uid() = user_id);

drop policy if exists "recurring_bills_insert_own" on public.recurring_bills;
create policy "recurring_bills_insert_own" on public.recurring_bills
  for insert with check (auth.uid() = user_id);

drop policy if exists "recurring_bills_update_own" on public.recurring_bills;
create policy "recurring_bills_update_own" on public.recurring_bills
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "recurring_bills_delete_own" on public.recurring_bills;
create policy "recurring_bills_delete_own" on public.recurring_bills
  for delete using (auth.uid() = user_id);
