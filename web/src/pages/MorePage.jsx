import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Button, Group, Stack, Text } from '@mantine/core';
import { IconChevronRight, IconSettings, IconLogout } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { VersionText } from '../components/Layout.jsx';
import { MORE_NAV } from '../lib/nav.js';

export default function MorePage() {
  const { client, user } = useSupabase();
  const navigate = useNavigate();

  return (
    <>
      <PageHeader title="更多" />
      <div className="page-body">
        <Stack gap="md">
          <div className="card">
            <Group p="md" gap="sm" wrap="nowrap">
              <Avatar color="coral" radius="xl">{user?.email?.[0]?.toUpperCase()}</Avatar>
              <div style={{ minWidth: 0 }}>
                <Text fw={600} truncate>{user?.email}</Text>
                <Text size="xs" c="dimmed">已登录</Text>
              </div>
            </Group>
          </div>

          <div className="card">
            {MORE_NAV.map((item) => (
              <Link key={item.to} to={item.to} className="list-row">
                <item.icon size={20} stroke={1.7} color="var(--mantine-color-coral-6)" />
                <span className="list-row-main">{item.label}</span>
                <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
              </Link>
            ))}
            <button type="button" className="list-row" onClick={() => navigate('/settings')}>
              <IconSettings size={20} stroke={1.7} color="var(--mantine-color-gray-6)" />
              <span className="list-row-main">Supabase 设置</span>
              <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
            </button>
          </div>

          <Button variant="default" color="red" leftSection={<IconLogout size={18} />} onClick={() => client.auth.signOut()}>
            退出登录
          </Button>
          <Text ta="center"><VersionText /></Text>
        </Stack>
      </div>
    </>
  );
}
