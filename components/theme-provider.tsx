'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  applyResolvedTheme,
  getServerThemeSnapshot,
  getThemeSnapshot,
  nextPreference,
  setThemePreference,
  subscribeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/client/theme-store';

export type { ThemePreference };
export { THEME_INIT_SCRIPT } from '@/lib/client/theme-store';

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (value: ThemePreference) => void;
  cycle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The theme lives in an external store rather than component state.
 *
 * localStorage and `prefers-color-scheme` are browser-only, so reading them
 * through useSyncExternalStore lets React reconcile the real value during
 * hydration — no mount effect, no extra render, and no flash to correct
 * (the inline script in the layout has already set the class).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  const setPreference = useCallback((value: ThemePreference) => setThemePreference(value), []);
  const cycle = useCallback(() => setThemePreference(nextPreference(getThemeSnapshot().preference)), []);

  // Push the resolved theme to the document — an external system, which is
  // exactly what an effect is for.
  useEffect(() => {
    applyResolvedTheme(state.resolved);
  }, [state.resolved]);

  const value = useMemo(
    () => ({ preference: state.preference, resolved: state.resolved, setPreference, cycle }),
    [state.preference, state.resolved, setPreference, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider.');
  return context;
}
