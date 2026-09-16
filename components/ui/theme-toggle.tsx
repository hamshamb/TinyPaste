'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/components/theme-provider';

const LABELS: Record<ThemePreference, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

const ICONS: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/** Small, unobtrusive tri-state cycle: light → dark → system. */
export function ThemeToggle() {
  const { preference, cycle } = useTheme();
  const Icon = ICONS[preference];

  return (
    <button
      type="button"
      onClick={cycle}
      // The label states the current mode so screen readers are not left to
      // infer it from the icon alone.
      aria-label={`${LABELS[preference]}. Activate to change theme.`}
      title={LABELS[preference]}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-text-muted tp-transition hover:bg-surface-muted hover:text-text-base active:scale-95"
    >
      <Icon aria-hidden className="h-4 w-4" strokeWidth={1.9} />
    </button>
  );
}
