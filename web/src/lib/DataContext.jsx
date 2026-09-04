import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSupabase } from './SupabaseContext.jsx';
import { useToast } from './ToastContext.jsx';
import { ensureDefaultCategories, listCategories, getAccountBalances, generateDueRecurringTransactions } from './api.js';

const DataContext = createContext(null);

/** 登录后共享的分类/账户数据，跟原来纯静态版本里 app.js 里模块级的 categories/accounts 变量是一个道理。 */
export function DataProvider({ children }) {
  const { client } = useSupabase();
  const showToast = useToast();
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [ready, setReady] = useState(false);

  const refreshCategories = useCallback(async () => {
    const data = await listCategories(client);
    setCategories(data);
    return data;
  }, [client]);

  const refreshAccounts = useCallback(async () => {
    const data = await getAccountBalances(client);
    setAccounts(data);
    return data;
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const cats = await ensureDefaultCategories(client);
        if (!cancelled) setCategories(cats);
      } catch (e) {
        showToast('加载分类失败：' + e.message, true);
      }
      try {
        const accs = await getAccountBalances(client);
        if (!cancelled) setAccounts(accs);
      } catch {
        // 账户表可能还没建（比如用的是没跑过最新 schema.sql 的旧项目），不阻塞其他功能
      }
      try {
        const generated = await generateDueRecurringTransactions(client);
        if (generated > 0) showToast(`已自动生成 ${generated} 笔到期账单`);
      } catch {
        // 同上，定时账单表不存在时静默跳过
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  return (
    <DataContext.Provider value={{ categories, accounts, refreshCategories, refreshAccounts, ready }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData 必须在 DataProvider 内部使用');
  return ctx;
}
