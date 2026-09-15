import { expect, test } from '@playwright/test';
import { createPaste, expectVisibleText, formError, recipientUrl } from './helpers';

test.describe('password protection', () => {
  test('locks the paste until the right password is given', async ({ page }) => {
    const url = await createPaste(page, {
      content: 'classified material',
      password: 'correct-horse',
    });

    await page.goto(recipientUrl(url));
    await expect(page.getByRole('heading', { name: /password protected/i })).toBeVisible();
    // The body must not be anywhere in the delivered document.
    expect(await page.content()).not.toContain('classified material');

    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(formError(page, 'Incorrect password')).toBeVisible();
    expect(await page.content()).not.toContain('classified material');

    await page.getByLabel('Password', { exact: true }).fill('correct-horse');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expectVisibleText(page, 'classified material');
  });

  test('blocks the raw route for a protected paste', async ({ page, request }) => {
    const url = await createPaste(page, { content: 'protected body', password: 'correct-horse' });
    const slug = new URL(url).pathname.split('/')[2];

    const response = await request.get(`/p/${slug}/raw`);
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain('protected body');
  });

  test('never sends the password in a URL', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    const url = await createPaste(page, { content: 'body', password: 'correct-horse' });
    await page.goto(recipientUrl(url));
    await page.getByLabel('Password', { exact: true }).fill('correct-horse');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expectVisibleText(page, 'body');

    for (const requestUrl of requests) {
      expect(requestUrl).not.toContain('correct-horse');
    }
  });
});

test.describe('burn after reading', () => {
  test('is not consumed by the creator landing on the page', async ({ page, context }) => {
    const url = await createPaste(page, { content: 'one-shot secret', burnAfterRead: true });

    await expect(page.getByRole('heading', { name: /burns after reading/i })).toBeVisible();
    expect(await page.content()).not.toContain('one-shot secret');

    // A separate browser context stands in for the recipient.
    const recipient = await context.browser()!.newContext();
    const recipientPage = await recipient.newPage();
    await recipientPage.goto(recipientUrl(url));
    await recipientPage.getByRole('button', { name: /Reveal and destroy/ }).click();
    await expect(recipientPage.locator('pre')).toContainText('one-shot secret');
    await recipient.close();
  });

  test('is unavailable after the first reveal', async ({ page }) => {
    const url = await createPaste(page, { content: 'burn me', burnAfterRead: true });
    const target = recipientUrl(url);

    await page.goto(target);
    await page.getByRole('button', { name: /Reveal and destroy/ }).click();
    await expect(page.locator('pre')).toContainText('burn me');

    await page.goto(target);
    await expect(page.getByRole('heading', { name: 'This paste is no longer available.' })).toBeVisible();
  });

  test('is not consumed by the raw route', async ({ page, request }) => {
    const url = await createPaste(page, { content: 'still here', burnAfterRead: true });
    const slug = new URL(url).pathname.split('/')[2];

    const raw = await request.get(`/p/${slug}/raw`);
    expect(raw.status()).toBe(409);
    expect(await raw.text()).not.toContain('still here');

    // The paste must still be readable afterwards.
    await page.goto(`/p/${slug}`);
    await page.getByRole('button', { name: /Reveal and destroy/ }).click();
    await expect(page.locator('pre')).toContainText('still here');
  });

  test('serves exactly one of two simultaneous reveals', async ({ page, request }) => {
    const url = await createPaste(page, { content: 'race condition', burnAfterRead: true });
    const slug = new URL(url).pathname.split('/')[2];

    const [first, second] = await Promise.all([
      request.post(`/api/pastes/${slug}/reveal`),
      request.post(`/api/pastes/${slug}/reveal`),
    ]);

    const statuses = [first.status(), second.status()].sort();
    expect(statuses).toEqual([200, 410]);
  });
});

test.describe('expiry', () => {
  test('serves a paste that is still inside its window', async ({ page, request }) => {
    // The shortest option is 10 minutes, so an actually-expired paste cannot be
    // produced through the UI. Enforcement across every read path is covered by
    // tests/unit/service.test.ts, which can control the clock.
    const url = await createPaste(page, { content: 'short lived', expiration: '10m' });
    const slug = new URL(url).pathname.split('/')[2];

    await expect(page.getByText(/Expires in/).first()).toBeVisible();
    expect((await request.get(`/p/${slug}/raw`)).status()).toBe(200);
  });
});

test.describe('security headers', () => {
  test('sets a strict policy on the home page', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-frame-options']).toBe('DENY');
  });

  test('marks paste pages as noindex', async ({ page }) => {
    const url = await createPaste(page, { content: 'not for crawlers' });
    await page.goto(recipientUrl(url));

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('keeps paste titles out of page metadata', async ({ page }) => {
    const url = await createPaste(page, {
      content: 'secret body',
      title: 'Production database credentials',
    });
    await page.goto(recipientUrl(url));

    // A link preview must not be able to leak the title or the body.
    await expect(page).toHaveTitle(/^Paste ·/);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).not.toContain('Production database credentials');
    expect(description).not.toContain('secret body');
  });
});

test.describe('API error shape', () => {
  test('returns a structured error without a stack trace', async ({ request }) => {
    const response = await request.post('/api/pastes', {
      data: { isEncrypted: false, content: '', language: 'plaintext', expiration: '1d' },
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(body)).not.toContain('at Object.');
  });

  test('rejects a cross-origin mutation', async ({ request, baseURL }) => {
    const response = await request.post('/api/pastes', {
      headers: { origin: 'https://evil.example' },
      data: {
        isEncrypted: false,
        content: 'csrf attempt',
        language: 'plaintext',
        expiration: '1d',
        burnAfterRead: false,
      },
    });

    expect(baseURL).toBeTruthy();
    expect(response.status()).toBe(400);
    expect((await response.json()).error.message).toContain('Cross-origin');
  });
});
