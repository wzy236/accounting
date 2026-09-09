import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, hasCustomSupabaseConfig, setSupabaseConfig, resetSupabaseConfig } from './config.js';

const SupabaseContext = createContext(null);

export function SupabaseProvider({ children }) {
  const [config, setConfigState] = useState(() => getSupabaseConfig());
  const [session, setSession] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // supabase-js 的 storageKey 带上 URL 的 hash，切换到不同 Supabase 项目时不会互相踩到对方的 session。
  const client = useMemo(
    () => createClient(config.url, config.anonKey, {
      auth: { storageKey: `sb-session-${btoa(config.url).replace(/[^a-zA-Z0-9]/g, '')}` },
    }),
    [config.url, config.anonKey]
  );

  useEffect(() => {
    setSessionLoaded(false);
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, [client]);

  function applyConfig(url, anonKey) {
    setSupabaseConfig(url, anonKey);
    setConfigState({ url, anonKey });
  }

  function applyResetConfig() {
    resetSupabaseConfig();
    setConfigState(getSupabaseConfig());
  }

  const value = {
    client,
    config,
    isCustomConfig: hasCustomSupabaseConfig(),
    applyConfig,
    resetConfig: applyResetConfig,
    session,
    sessionLoaded,
    user: session?.user || null,
  };

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error('useSupabase 必须在 SupabaseProvider 内部使用');
  return ctx;
}
