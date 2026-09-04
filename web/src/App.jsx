import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSupabase } from './lib/SupabaseContext.jsx';
import AuthPage from './pages/AuthPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import Layout from './components/Layout.jsx';
import TransactionsPage from './pages/TransactionsPage.jsx';
import AccountsPage from './pages/AccountsPage.jsx';
import BillsPage from './pages/BillsPage.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';

// 图表（chart.js）和 PDF 导入（pdfjs-dist）体积比较大，不是每次打开都用得到，懒加载减小首屏体积。
const ChartsPage = lazy(() => import('./pages/ChartsPage.jsx'));
const ImportPage = lazy(() => import('./pages/ImportPage.jsx'));

export default function App() {
  const { session, sessionLoaded } = useSupabase();

  if (!sessionLoaded) return null;

  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      {!session ? (
        <Route path="/*" element={<AuthPage />} />
      ) : (
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/transactions" replace />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="bills" element={<BillsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="charts" element={<Suspense><ChartsPage /></Suspense>} />
          <Route path="import" element={<Suspense><ImportPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/transactions" replace />} />
        </Route>
      )}
    </Routes>
  );
}
