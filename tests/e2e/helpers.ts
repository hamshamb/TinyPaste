import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export type CreateOptions = {
  content: string;
  title?: string;
  language?: string;
  expiration?: string;
  password?: string;
  burnAfterRead?: boolean;
  encrypt?: boolean;
};

/** Fill in the create form and submit it, returning the resulting paste URL. */
export async function createPaste(page: Page, options: CreateOptions): Promise<string> {
  await page.goto('/');

  if (options.title) await page.getByPlaceholder('Optional title').fill(options.title);
  if (options.language) await page.getByLabel('Language').selectOption(options.language);
  await page.getByLabel('Paste content').fill(options.content);

  if (options.expiration || options.password || options.burnAfterRead || options.encrypt) {
    if (options.expiration) await page.getByLabel('Expiration').selectOption(options.expiration);

    if (options.password || options.burnAfterRead || options.encrypt) {
      await page.getByRole('button', { name: /Security options/ }).click();
      if (options.encrypt) await page.getByLabel('Encrypt in browser').check();
      if (options.burnAfterRead) await page.getByLabel('Burn after reading').check();
      if (options.password) {
        await page.getByLabel('Password protect').check();
        await page.getByLabel('Password', { exact: true }).fill(options.password);
      }
    }
  }

  await page.getByRole('button', { name: 'Create Paste' }).click();
  await page.waitForURL(/\/p\/[A-Za-z0-9]+/);
  return page.url();
}

/** Strip the `?created=1` marker so a URL behaves like one a recipient receives. */
export function recipientUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete('created');
  return parsed.toString();
}

export async function expectVisibleText(page: Page, text: string): Promise<void> {
  await expect(page.locator('pre')).toContainText(text);
}

/**
 * Next.js renders a route announcer with role="alert", so an unscoped
 * getByRole('alert') is always ambiguous. Match on the message instead.
 */
export function formError(page: Page, text: string) {
  return page.getByRole('alert').filter({ hasText: text });
}

/**
 * Block until React has hydrated the editor page.
 *
 * Keyboard shortcuts and the command palette are attached by client effects, so
 * a key pressed between `load` and hydration is simply dropped. The disclosure
 * button is server-rendered with aria-expanded="false" and only flips once
 * React is listening, which makes it a reliable readiness signal.
 */
export async function waitForHydration(page: Page): Promise<void> {
  const disclosure = page.getByRole('button', { name: /Security options/ });
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
}
