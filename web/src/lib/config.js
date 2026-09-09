// Supabase 项目配置：默认项目 + 每个浏览器可选的自定义覆盖（存 localStorage）。
// 跟 legacy-static/js/config.js（原来的纯静态版本）设计完全一致，方便迁移。
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
