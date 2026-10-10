import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Code, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { confirmAction } from '../lib/confirm.jsx';

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

  async function handleReset() {
    const ok = await confirmAction({ title: '恢复默认配置', message: '恢复使用默认的 Supabase 项目？', confirmLabel: '恢复', danger: false });
    if (!ok) return;
    resetConfig();
    setUrl(config.url);
    setAnonKey('');
  }

  return (
    <div className="auth-wrap">
      <Paper w="100%" maw={520} p="xl" radius="lg" shadow="md" withBorder>
        <Stack gap="md">
          <Title order={3}>Supabase 设置</Title>
          <Text size="sm" c="dimmed">
            默认已经配置好一个可用的 Supabase 项目。如果想用自己的项目存数据，在下面粘贴它的 <b>Project URL</b> 和
            <b> anon / publishable key</b>（Supabase 后台 Project Settings → API），并确保已经在该项目的 SQL Editor 里执行过
            仓库里的 <Code>sql/schema.sql</Code>。配置只保存在当前这台设备的浏览器里。
          </Text>
          <Alert variant="light" color={isCustomConfig ? 'coral' : 'gray'}>
            {isCustomConfig ? '当前使用自定义项目：' : '当前使用默认项目：'}{config.url}
          </Alert>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              {error && <Alert color="red" variant="light">{error}</Alert>}
              {success && <Alert color="teal" variant="light">{success}</Alert>}
              <TextInput label="Supabase Project URL" type="url" placeholder="https://xxxx.supabase.co" required value={url} onChange={(e) => setUrl(e.target.value)} />
              <TextInput label="anon / publishable key" placeholder="sb_publishable_... 或 eyJ..." required value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
              <Button type="submit">保存并切换</Button>
            </Stack>
          </form>
          <Group justify="space-between">
            <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate(-1)}>返回</Button>
            <Button variant="subtle" color="gray" onClick={handleReset}>恢复默认配置</Button>
          </Group>
        </Stack>
      </Paper>
    </div>
  );
}
