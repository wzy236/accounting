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
