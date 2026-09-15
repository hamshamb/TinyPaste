'use client';

import { useEffect, useState } from 'react';
import { formatAbsolute, formatExpiry, formatRelative } from '@/lib/utils/time';

/**
 * Timestamps are stored in UTC and rendered in the visitor's own timezone and
 * locale. That can only be done in the browser, so the first paint shows a
 * stable placeholder and the real value appears after hydration — this avoids a
 * server/client mismatch without blocking the content.
 */
export function RelativeTime({ iso, prefix }: { iso: string; prefix?: string }) {
  const [text, setText] = useState('');

  useEffect(() => {
    const update = () => setText(formatRelative(iso));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [iso]);

  return (
    <time dateTime={iso} title={formatAbsolute(iso)} suppressHydrationWarning>
      {text ? `${prefix ?? ''}${text}` : ''}
    </time>
  );
}

export function ExpiryTime({ expiresAt }: { expiresAt: string | null }) {
  const [text, setText] = useState('');

  useEffect(() => {
    const update = () => setText(formatExpiry(expiresAt));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (!text) return <span suppressHydrationWarning />;
  return (
    <span title={expiresAt ? formatAbsolute(expiresAt) : 'This paste never expires'} suppressHydrationWarning>
      {text}
    </span>
  );
}
