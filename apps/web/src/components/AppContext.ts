'use client';

import { createContext, useContext } from 'react';

console.log('[module-load]', 'AppContext');

export const AppContext = createContext<any>(null);

export function useApp<T = any>(): T {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside Providers');
  return ctx as T;
}
