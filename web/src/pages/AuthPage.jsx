import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Anchor, Button, Paper, PasswordInput, SegmentedControl, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { IconNotebook } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';

export default function AuthPage() {
  const { client } = useSupabase();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(m) {
    setMode(m);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (mode === 'register' && password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError(err.status === 400 ? '邮箱或密码错误' : err.message);
      } else {
        const { data, error: err } = await client.auth.signUp({ email: email.trim(), password });
        if (err) {
          setError(err.message);
        } else if (!data.session) {
          setSuccess('注册成功，请前往邮箱完成确认后再登录。');
          setPassword('');
          setConfirm('');
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <Paper w="100%" maw={400} p="xl" radius="lg" shadow="md" withBorder>
        <Stack gap="lg">
          <Stack gap={6} align="center">
            <span className="brand-logo" style={{ width: 52, height: 52, borderRadius: 16 }}><IconNotebook size={30} /></span>
            <Title order={3}>记账本</Title>
            <Text size="sm" c="dimmed">记录每一笔收支</Text>
          </Stack>

          <SegmentedControl
            fullWidth
            data={[{ label: '登录', value: 'login' }, { label: '注册', value: 'register' }]}
            value={mode}
            onChange={switchMode}
          />

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              {error && <Alert color="red" variant="light">{error}</Alert>}
              {success && <Alert color="teal" variant="light">{success}</Alert>}
              <TextInput label="邮箱" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <PasswordInput
                label={mode === 'register' ? '密码（至少 6 位）' : '密码'}
                required
                minLength={mode === 'register' ? 6 : undefined}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'register' && (
                <PasswordInput label="确认密码" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              )}
              <Button type="submit" fullWidth size="md" loading={loading}>{mode === 'login' ? '登录' : '注册'}</Button>
            </Stack>
          </form>

          <Text size="xs" ta="center">
            <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => navigate('/settings')}>
              使用自己的 Supabase 项目 / Supabase 设置
            </Anchor>
          </Text>
        </Stack>
      </Paper>
    </div>
  );
}
