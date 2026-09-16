'use client';

/**
 * Copy text to the clipboard.
 *
 * navigator.clipboard is unavailable on insecure origins and in some
 * in-app browsers, so a hidden-textarea fallback keeps the action working.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copy rich text with a plain-text fallback in the same clipboard write.
 *
 * Used for document pastes: pasting into a rich editor (an email, a Google
 * Doc) keeps formatting, while pasting into a plain-text field — or a browser
 * that only supports writeText — gets the plain-text flattening instead. Both
 * payloads are generated locally; nothing here ever leaves the browser.
 */
export async function copyRichText(html: string, plainText: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.write && window.isSecureContext && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    // Fall through to the plain-text path.
  }
  return copyText(plainText);
}

/** Trigger a client-side download without ever sending the content anywhere. */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so the navigation has started.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
