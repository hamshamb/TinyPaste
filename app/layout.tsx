import type { Metadata, Viewport } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/theme-provider';
import { ToastProvider } from '@/components/ui/toast';
import { CommandPalette } from '@/components/command-palette';
import { StorageNotice } from '@/components/layout/storage-notice';
import { isUsingVolatileStorage } from '@/lib/db';
import { site } from '@/lib/config/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  // No analytics, no verification tags, no third-party embeds.
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const volatileStorage = isUsingVolatileStorage();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <ToastProvider>
            <a
              href="#main"
              className="sr-only-focusable absolute left-4 top-3 z-50 rounded-md border border-border-base bg-surface px-3 py-2 text-sm font-medium"
            >
              Skip to content
            </a>
            {volatileStorage ? <StorageNotice /> : null}
            <Header />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
            <CommandPalette />
          </ToastProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
