import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '../lib/SupabaseContext.jsx';

export default function SettingsPage() {
  const { config, isCustomConfig, applyConfig, resetConfig } = useSupabase();
  const navigate = useNavigate();
  const [url, setUrl] = useState(config.url);
  const [anonKey, setAnonKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const trimmedUrl = url.trim().replace(/\/+$/, '');
    const trimmedKey = anonKey.trim();
    if (!trimmedUrl || !trimmedKey) return;
    try {
      new URL(trimmedUrl);
    } catch {
      setError('Supabase URL 格式不对，应该形如 https://xxxx.supabase.co');
      return;
    }
    applyConfig(trimmedUrl, trimmedKey);
    setSuccess('已保存，正在切换项目…');
  }

  function handleReset() {
    if (!window.confirm('恢复默认 Supabase 配置？')) return;
    resetConfig();
    setUrl(config.url);
    setAnonKey('');
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>⚙️ Supabase 设置</h1>
        <p className="hint">
          默认已经配置好一个可用的 Supabase 项目。如果你想用自己的 Supabase 项目存数据，
          在下面粘贴你自己项目的 <strong>Project URL</strong> 和 <strong>anon / publishable key</strong>
          （在 Supabase 后台 Project Settings → API 页面可以找到），并确保已经在该项目的 SQL Editor
          里执行过仓库里的 <code>sql/schema.sql</code>。配置只保存在你当前这台设备的浏览器里，不会影响其他访问者。
        </p>
        <p className="hint">{isCustomConfig ? `当前使用自定义项目：${config.url}` : `当前使用默认项目：${config.url}`}</p>
        <form onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}
          <label>Supabase Project URL
            <input type="url" placeholder="https://xxxx.supabase.co" required value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label>anon / publishable key
            <input type="text" placeholder="sb_publishable_... 或 eyJ..." required value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
          </label>
          <button type="submit" className="btn primary">保存并切换</button>
        </form>
        <p className="auth-switch">
          <a href="#" onClick={(e) => { e.preventDefault(); handleReset(); }}>恢复默认配置</a>
          &nbsp;|&nbsp;
          <a href="#" onClick={(e) => { e.preventDefault(); navigate(-1); }}>返回</a>
        </p>
      </div>
    </div>
  );
}
