import { expect, test } from '@playwright/test';
import { createPaste, expectCodeEditorValue, expectVisibleText, formError, recipientUrl } from './helpers';

test.describe('plain pastes', () => {
  test('creates a paste, shares it, and survives a reload', async ({ page }) => {
    const url = await createPaste(page, { content: 'hello from playwright', title: 'Greeting' });

    await expect(page.getByRole('heading', { name: 'Paste created' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Greeting' })).toBeVisible();
    await expectVisibleText(page, 'hello from playwright');

    await page.goto(recipientUrl(url));
    await expectVisibleText(page, 'hello from playwright');
    await expect(page.getByRole('heading', { name: 'Paste created' })).toHaveCount(0);
  });

  test('offers copy, raw, download and fork', async ({ page }) => {
    await createPaste(page, { content: 'action bar test' });

    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Raw' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fork' })).toBeVisible();
  });

  test('serves the raw route as plain text', async ({ page, request }) => {
    const url = await createPaste(page, { content: 'raw body content' });
    const slug = new URL(url).pathname.split('/')[2];

    const response = await request.get(`/p/${slug}/raw`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(await response.text()).toBe('raw body content');
  });

  test('serves the download route as an attachment with a safe filename', async ({ page, request }) => {
    const url = await createPaste(page, {
      content: 'console.log(1);',
      title: '../../etc/passwd',
      language: 'javascript',
    });
    const slug = new URL(url).pathname.split('/')[2];

    const response = await request.get(`/p/${slug}/download`);
    expect(response.status()).toBe(200);

    const disposition = response.headers()['content-disposition'] ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).not.toContain('..');
    expect(disposition).not.toContain('/etc/');
  });

  test('forks content into a new paste without touching the original', async ({ page }) => {
    const original = await createPaste(page, { content: 'forkable content', title: 'Original' });

    await page.getByRole('button', { name: 'Fork' }).click();
    await page.waitForURL(/\/$/);
    await expectCodeEditorValue(page, 'forkable content');
    await expect(page.getByLabel('Title')).toHaveValue('Fork of Original');

    await page.goto(recipientUrl(original));
    await expectVisibleText(page, 'forkable content');
  });

  test('counts views', async ({ page }) => {
    const url = await createPaste(page, { content: 'view counted' });
    // The creator's own redirect is not counted.
    await expect(page.getByText(/0 views/)).toBeVisible();

    await page.goto(recipientUrl(url));
    await expect(page.getByText(/1 view\b/)).toBeVisible();
  });
});

test.describe('validation and limits', () => {
  test('refuses an empty paste', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create paste' }).click();

    await expect(formError(page, 'Enter something to paste')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('shows a not-found state for an unknown slug', async ({ page }) => {
    await page.goto('/p/ZzZzZzZz');
    await expect(page.getByRole('heading', { name: 'Paste not found.' })).toBeVisible();
  });

  test('shows a not-found state for a malformed slug rather than an error', async ({ page }) => {
    await page.goto('/p/a');
    await expect(page.getByRole('heading', { name: 'Paste not found.' })).toBeVisible();
  });
});

test.describe('syntax highlighting', () => {
  test('highlights code without altering what is copied', async ({ page }) => {
    const source = 'const answer = 42;\nfunction greet() { return "hi"; }';
    const url = await createPaste(page, { content: source, language: 'javascript' });

    await expect(page.getByText('JavaScript').first()).toBeVisible();
    // Highlighting is applied asynchronously; the tokens must still reconstruct
    // the original source exactly.
    await expect
      .poll(async () => (await page.locator('pre code').innerText()).includes('const answer = 42;'))
      .toBe(true);

    const slug = new URL(url).pathname.split('/')[2];
    const raw = await page.request.get(`/p/${slug}/raw`);
    expect(await raw.text()).toBe(source);
  });
});

test.describe('XSS safety', () => {
  test('renders a script tag as text and never executes it', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    const payload = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    const url = await createPaste(page, { content: payload, language: 'html' });

    await expectVisibleText(page, '<script>alert("xss")</script>');
    // No script element and no image may have been created from the payload.
    expect(await page.locator('pre script').count()).toBe(0);
    expect(await page.locator('pre img').count()).toBe(0);

    await page.goto(recipientUrl(url));
    await expectVisibleText(page, 'onerror=alert(1)');
    expect(dialogs).toEqual([]);
  });

  test('serves a raw HTML paste as inert text', async ({ page, request }) => {
    const url = await createPaste(page, { content: '<script>alert(1)</script>', language: 'html' });
    const slug = new URL(url).pathname.split('/')[2];

    const response = await request.get(`/p/${slug}/raw`);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect(response.headers()['content-security-policy']).toContain('sandbox');
  });
});
