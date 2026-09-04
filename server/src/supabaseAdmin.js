import { createClient } from '@supabase/supabase-js';

/**
 * 用 service_role key 建的客户端，绕过 RLS，只能在这个后端里用。
 * 每次调用都新建一个客户端（这里没有登录状态要维护，不需要单例）。
 */
export function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
