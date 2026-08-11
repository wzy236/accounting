// Supabase 项目配置。anon key 设计上就是公开的（会被打进前端代码里），
// 真正的数据安全依赖 sql/schema.sql 里开启的 Row Level Security 策略。
// 如果要换成你自己的 Supabase 项目，把下面两个值换掉即可。
export const SUPABASE_URL = 'https://hgdtukyorpngghgkelhz.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_sPMeGgA4gKEh_yI2J7H9qA__0LD6X-g';
