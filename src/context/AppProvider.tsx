import { type ReactNode } from 'react';
import { useAppState } from './useAppState';
import { AppContext } from './AppContext';

export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppState();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
