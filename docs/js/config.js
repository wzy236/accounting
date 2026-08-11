// Supabase 项目配置。anon/publishable key 设计上就是公开的（会被打进前端代码里），
// 真正的数据安全依赖 sql/schema.sql 里开启的 Row Level Security 策略。
//
// 默认使用下面这个项目；如果你想用自己的 Supabase 项目，不需要改代码，
// 直接在网站的“Supabase 设置”页面里粘贴你自己的 URL 和 anon/publishable key 即可，
// 配置会保存在浏览器本地（localStorage），不影响其他访问者。
const DEFAULT_SUPABASE_URL = 'https://hgdtukyorpngghgkelhz.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_sPMeGgA4gKEh_yI2J7H9qA__0LD6X-g';

const STORAGE_KEY = 'accounting_supabase_config';

function loadCustomConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.url && parsed?.anonKey ? parsed : null;
  } catch {
    return null;
  }
}

/** 当前生效的配置：本地自定义配置优先，否则用内置默认值。 */
export function getSupabaseConfig() {
  const custom = loadCustomConfig();
  return custom || { url: DEFAULT_SUPABASE_URL, anonKey: DEFAULT_SUPABASE_ANON_KEY };
}

export function hasCustomSupabaseConfig() {
  return !!loadCustomConfig();
}

export function setSupabaseConfig(url, anonKey) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, anonKey }));
}

export function resetSupabaseConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
