import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SESSION_KEY = 'accounting_session';
const REFRESH_SKEW_MS = 60 * 1000; // 提前 60 秒刷新 token

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function sessionFromAuthResponse(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    user: { id: data.user.id, email: data.user.email },
  };
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
}

async function authFetch(path, body, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const err = new Error(data.error_description || data.msg || data.message || '请求失败');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function signUp(email, password) {
  const data = await authFetch('/signup', { email, password });
  if (data.access_token) {
    saveSession(sessionFromAuthResponse(data));
    return { needsEmailConfirmation: false };
  }
  // 项目开启了邮箱确认时，signup 只返回用户信息，没有 session
  return { needsEmailConfirmation: true };
}

export async function signIn(email, password) {
  const data = await authFetch('/token?grant_type=password', { email, password });
  saveSession(sessionFromAuthResponse(data));
  return data.user;
}

export async function signOut() {
  const session = loadSession();
  if (session?.access_token) {
    try {
      await authFetch('/logout', {}, { Authorization: `Bearer ${session.access_token}` });
    } catch {
      // 忽略登出请求失败，本地 session 依然清除
    }
  }
  clearSession();
}

async function refreshSession(session) {
  const data = await authFetch('/token?grant_type=refresh_token', {
    refresh_token: session.refresh_token,
  });
  const next = sessionFromAuthResponse(data);
  saveSession(next);
  return next;
}

/** 返回当前有效的 access token；session 不存在或刷新失败时返回 null。 */
export async function getValidAccessToken() {
  let session = loadSession();
  if (!session) return null;
  if (Date.now() > session.expires_at - REFRESH_SKEW_MS) {
    try {
      session = await refreshSession(session);
    } catch {
      clearSession();
      return null;
    }
  }
  return session.access_token;
}

export function getCurrentUser() {
  const session = loadSession();
  return session?.user || null;
}

export function isLoggedIn() {
  return !!loadSession();
}

/** 对 PostgREST（/rest/v1/...）发起请求，自动带上 apikey + 用户 token。 */
export async function restRequest(path, { method = 'GET', body, prefer } = {}) {
  const token = await getValidAccessToken();
  if (!token) {
    const err = new Error('未登录或登录已过期');
    err.status = 401;
    throw err;
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const err = new Error(data.message || '请求失败');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
