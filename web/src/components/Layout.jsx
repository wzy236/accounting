import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { DataProvider } from '../lib/DataContext.jsx';

const NAV_ITEMS = [
  { to: '/transactions', label: '记账' },
  { to: '/accounts', label: '账户' },
  { to: '/bills', label: '定时账单' },
  { to: '/charts', label: '统计图表' },
  { to: '/categories', label: '分类管理' },
  { to: '/import', label: '导入对账单' },
];

export default function Layout() {
  const { client, user } = useSupabase();
  const navigate = useNavigate();

  async function handleLogout() {
    await client.auth.signOut();
  }

  return (
    <div>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink className="brand" to="/transactions">📒 记账本</NavLink>
          <nav className="nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="user-area">
            <span className="username">{user?.email}</span>
            <button type="button" className="link-btn" onClick={() => navigate('/settings')}>
              Supabase 设置
            </button>
            <button type="button" className="link-btn" onClick={handleLogout}>退出</button>
          </div>
        </div>
      </header>
      <main className="container">
        <DataProvider>
          <Outlet />
        </DataProvider>
      </main>
    </div>
  );
}
