import { NavLink as RouterNavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, NavLink, Text, Tooltip } from '@mantine/core';
import {
  IconNotebook, IconChartPie, IconWallet, IconDots, IconSettings, IconLogout,
} from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { DataProvider } from '../lib/DataContext.jsx';
import { COMMIT_SHA, BUILD_TIME } from '../lib/version.js';
import { MORE_NAV } from '../lib/nav.js';

const MAIN_NAV = [
  { to: '/transactions', label: '记账', icon: IconNotebook },
  { to: '/charts', label: '统计', icon: IconChartPie },
  { to: '/accounts', label: '账户', icon: IconWallet },
];

function TodayIcon() {
  return <span className="today-icon">{new Date().getDate()}</span>;
}

export function VersionText() {
  return (
    <Tooltip label={BUILD_TIME ? `构建时间（UTC）：${BUILD_TIME}` : '本地开发环境'}>
      <Text size="xs" c="dimmed" ff="monospace" span>v{COMMIT_SHA}</Text>
    </Tooltip>
  );
}

function Sidebar() {
  const { client, user } = useSupabase();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const link = (item) => (
    <NavLink
      key={item.to}
      component={RouterNavLink}
      to={item.to}
      label={item.label}
      leftSection={<item.icon size={19} stroke={1.7} />}
      active={pathname.startsWith(item.to)}
      variant="light"
      style={{ borderRadius: 'var(--mantine-radius-md)' }}
    />
  );

  return (
    <Box component="aside" className="sidebar" visibleFrom="sm">
      <div className="sidebar-brand">
        <span className="brand-logo"><IconNotebook size={20} /></span>
        记账本
      </div>
      {MAIN_NAV.map(link)}
      <Text size="xs" c="dimmed" fw={600} px="sm" mt="lg" mb={4}>管理</Text>
      {MORE_NAV.map(link)}
      <div className="sidebar-footer">
        <Text size="sm" fw={600} truncate mb={6}>{user?.email}</Text>
        <NavLink
          label="Supabase 设置"
          leftSection={<IconSettings size={17} stroke={1.7} />}
          onClick={() => navigate('/settings')}
          style={{ borderRadius: 'var(--mantine-radius-md)' }}
        />
        <NavLink
          label="退出登录"
          leftSection={<IconLogout size={17} stroke={1.7} />}
          onClick={() => client.auth.signOut()}
          style={{ borderRadius: 'var(--mantine-radius-md)' }}
        />
        <Box px="sm" pt={6}><VersionText /></Box>
      </div>
    </Box>
  );
}

function BottomTabs() {
  const { pathname } = useLocation();
  const moreActive = pathname.startsWith('/more') || MORE_NAV.some((n) => pathname.startsWith(n.to));
  const tabs = [
    { to: '/transactions', label: '记账', icon: <TodayIcon /> },
    { to: '/charts', label: '统计', icon: <IconChartPie size={23} stroke={1.6} /> },
    { to: '/accounts', label: '账户', icon: <IconWallet size={23} stroke={1.6} /> },
    { to: '/more', label: '更多', icon: <IconDots size={23} stroke={1.6} />, active: moreActive },
  ];
  return (
    <Box component="nav" className="bottom-tabs" hiddenFrom="sm">
      {tabs.map((t) => (
        <RouterNavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `bottom-tab${(t.active ?? isActive) ? ' active' : ''}`}
        >
          {t.icon}
          {t.label}
        </RouterNavLink>
      ))}
    </Box>
  );
}

export default function Layout() {
  return (
    <>
      <Sidebar />
      <main className="app-main">
        <DataProvider>
          <Outlet />
        </DataProvider>
      </main>
      <BottomTabs />
    </>
  );
}
