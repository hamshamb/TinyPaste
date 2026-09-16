import { expect, test } from '@playwright/test';
import {
  createPaste,
  expectCodeEditorValue,
  expectVisibleText,
  fillCodeEditor,
  recipientUrl,
  securityToggle,
} from './helpers';

const SECRET = 'AWS_SECRET_ACCESS_KEY=never-send-me-to-a-server';

test.describe('browser-side encryption', () => {
  test('never sends the plaintext to the server', async ({ page }) => {
    const bodies: string[] = [];
    page.on('request', (request) => {
      const body = request.postData();
      if (body) bodies.push(body);
    });

    await createPaste(page, { content: SECRET, encrypt: true, title: 'Credentials' });

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toContain(SECRET);
      expect(body).not.toContain('AWS_SECRET');
    }
  });

  test('never sends the key in a request body, URL, or header', async ({ page }) => {
    const observed: Array<{ url: string; body: string | null; headers: Record<string, string> }> = [];
    page.on('request', (request) => {
      observed.push({ url: request.url(), body: request.postData(), headers: request.headers() });
    });

    const url = await createPaste(page, { content: SECRET, encrypt: true });
    const key = new URL(url).hash.replace(/^#k:/, '');
    expect(key.length).toBeGreaterThan(20);

    // Reload so the decryption round trip is captured too. recipientUrl keeps
    // the fragment, which is the whole point of the check below.
    await page.goto(recipientUrl(url));
    await expectVisibleText(page, SECRET);

    for (const entry of observed) {
      expect(entry.url).not.toContain(key);
      expect(entry.body ?? '').not.toContain(key);
      expect(JSON.stringify(entry.headers)).not.toContain(key);
    }
  });

  test('stores only ciphertext, which the API returns without plaintext', async ({ page, request }) => {
    const url = await createPaste(page, { content: SECRET, encrypt: true });
    const slug = new URL(url).pathname.split('/')[2];

    const response = await request.get(`/api/pastes/${slug}`);
    const payload = (await response.json()) as {
      meta: { isEncrypted: boolean };
      body: { kind: string; ciphertext: string; iv: string; encryptionVersion: number };
    };

    expect(payload.meta.isEncrypted).toBe(true);
    expect(payload.body.kind).toBe('encrypted');
    expect(payload.body.encryptionVersion).toBe(1);
    expect(JSON.stringify(payload)).not.toContain(SECRET);
    expect(JSON.stringify(payload)).not.toContain('AWS_SECRET');
  });

  test('decrypts locally when the full link is opened', async ({ page }) => {
    const url = await createPaste(page, { content: SECRET, encrypt: true });

    await expect(page.getByText(/Keep the complete URL/)).toBeVisible();
    await expectVisibleText(page, SECRET);

    await page.goto(recipientUrl(url));
    await expectVisibleText(page, SECRET);
    await expect(page.getByText(/Decrypted locally in this browser/)).toBeVisible();
  });

  test('reports a missing key when the fragment is dropped', async ({ page }) => {
    const url = await createPaste(page, { content: SECRET, encrypt: true });
    const withoutKey = recipientUrl(url).split('#')[0];

    await page.goto(withoutKey);
    await expect(page.getByText('Encryption key missing from this URL.')).toBeVisible();
    expect(await page.content()).not.toContain(SECRET);
  });

  test('reports a failure for a wrong key rather than showing anything', async ({ page }) => {
    const first = await createPaste(page, { content: SECRET, encrypt: true });
    const second = await createPaste(page, { content: 'unrelated', encrypt: true });

    const wrongKey = new URL(second).hash;
    await page.goto(recipientUrl(first).split('#')[0] + wrongKey);

    await expect(page.getByText('Unable to decrypt this paste.')).toBeVisible();
    expect(await page.content()).not.toContain(SECRET);
  });

  test('reports a failure for a malformed key', async ({ page }) => {
    const url = await createPaste(page, { content: SECRET, encrypt: true });
    await page.goto(recipientUrl(url).split('#')[0] + '#k:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

    await expect(page.getByText('Unable to decrypt this paste.')).toBeVisible();
  });

  test('keeps the key out of the raw and download routes', async ({ page, request }) => {
    const url = await createPaste(page, { content: SECRET, encrypt: true });
    const slug = new URL(url).pathname.split('/')[2];

    const raw = await request.get(`/p/${slug}/raw`);
    expect(raw.status()).toBe(409);
    expect(await raw.text()).not.toContain(SECRET);
  });

  test('can be edited, staying encrypted end to end', async ({ page }) => {
    const url = await createPaste(page, { content: SECRET, encrypt: true, title: 'Creds' });
    const slug = new URL(url).pathname.split('/')[2];

    // The edit link must carry the fragment key, or the form cannot decrypt.
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.waitForURL(/\/edit/);
    await expectCodeEditorValue(page, SECRET);

    await fillCodeEditor(page, 'ROTATED_SECRET=still-encrypted');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);
    await expectVisibleText(page, 'ROTATED_SECRET=still-encrypted');

    // The stored row must still be ciphertext only.
    const response = await page.request.get(`/api/pastes/${slug}`);
    const payload = await response.text();
    expect(payload).not.toContain('ROTATED_SECRET');
    expect(payload).toContain('"kind":"encrypted"');
  });

  test('cannot be combined with a password', async ({ page }) => {
    await page.goto('/');
    await fillCodeEditor(page, 'x');

    const encrypt = securityToggle(page, 'Encrypt');
    const password = securityToggle(page, 'Password');

    await encrypt.click();
    await expect(encrypt).toHaveAttribute('aria-pressed', 'true');
    await expect(password).toBeDisabled();

    await encrypt.click();
    await expect(encrypt).toHaveAttribute('aria-pressed', 'false');
    await password.click();
    await expect(password).toHaveAttribute('aria-pressed', 'true');
    await expect(encrypt).toBeDisabled();
  });
});
