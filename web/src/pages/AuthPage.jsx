import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '../lib/SupabaseContext.jsx';

export default function AuthPage() {
  const { client } = useSupabase();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    const { error } = await client.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    if (error) {
      setLoginError(error.status === 400 ? '邮箱或密码错误' : error.message);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');
    if (regPassword !== regConfirm) {
      setRegError('两次输入的密码不一致');
      return;
    }
    const { data, error } = await client.auth.signUp({ email: regEmail.trim(), password: regPassword });
    if (error) {
      setRegError(error.message);
      return;
    }
    if (!data.session) {
      setRegSuccess('注册成功，请前往邮箱完成确认后再登录。');
      setRegEmail('');
      setRegPassword('');
      setRegConfirm('');
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>📒 记账本</h1>

        {mode === 'login' ? (
          <>
            <form onSubmit={handleLogin}>
              {loginError && <p className="error">{loginError}</p>}
              <label>邮箱
                <input type="email" required autoComplete="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              </label>
              <label>密码
                <input type="password" required autoComplete="current-password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
              </label>
              <button type="submit" className="btn primary">登录</button>
            </form>
            <p className="auth-switch">还没有账号？<a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); }}>立即注册</a></p>
          </>
        ) : (
          <>
            <form onSubmit={handleRegister}>
              {regError && <p className="error">{regError}</p>}
              {regSuccess && <p className="success">{regSuccess}</p>}
              <label>邮箱
                <input type="email" required autoComplete="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
              </label>
              <label>密码（至少 6 位）
                <input type="password" minLength={6} required autoComplete="new-password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
              </label>
              <label>确认密码
                <input type="password" minLength={6} required autoComplete="new-password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} />
              </label>
              <button type="submit" className="btn primary">注册</button>
            </form>
            <p className="auth-switch">已有账号？<a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>直接登录</a></p>
          </>
        )}

        <p className="auth-switch">
          <a href="#" onClick={(e) => { e.preventDefault(); navigate('/settings'); }}>使用自己的 Supabase 项目 / Supabase 设置</a>
        </p>
      </div>
    </div>
  );
}
