// Supabase 项目配置。anon key 设计上就是公开的（会被打进前端代码里），
// 真正的数据安全依赖 sql/schema.sql 里开启的 Row Level Security 策略。
// 如果要换成你自己的 Supabase 项目，把下面两个值换掉即可。
export const SUPABASE_URL = 'https://trvorehkbmmspxhcxban.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRydm9yZWhrYm1tc3B4aGN4YmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDQ0MzMsImV4cCI6MjA5NjY4MDQzM30.MkAKNzV9WyXW5gEnBbwHhlBF1eGFrOsZbMw2EohfE1s';
