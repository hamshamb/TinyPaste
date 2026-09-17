import { expect, test } from '@playwright/test';
import {
  createPaste,
  expectCodeEditorValue,
  expectVisibleText,
  fillCodeEditor,
  recipientUrl,
  waitForHydration,
} from './helpers';

test.describe('edit tokens', () => {
  test('lets the creating browser edit a paste', async ({ page }) => {
    const url = await createPaste(page, { content: 'first draft', title: 'Draft' });

    await page.getByRole('link', { name: 'Edit' }).click();
    await page.waitForURL(/\/edit$/);

    await fillCodeEditor(page, 'second draft');
    await page.getByLabel('Title').fill('Final');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await page.waitForURL(/\/p\/[A-Za-z0-9]+$/);
    await expectVisibleText(page, 'second draft');
    await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();

    await page.goto(recipientUrl(url));
    await expectVisibleText(page, 'second draft');
  });

  test('hides edit and delete from a browser without the token', async ({ page, context }) => {
    const url = await createPaste(page, { content: 'not yours' });

    const stranger = await context.browser()!.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(recipientUrl(url));

    await expect(strangerPage.locator('pre')).toContainText('not yours');
    await expect(strangerPage.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await expect(strangerPage.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await stranger.close();
  });

  test('rejects an edit without a valid token at the API level', async ({ page, request }) => {
    const url = await createPaste(page, { content: 'protected by token' });
    const slug = new URL(url).pathname.split('/')[2];

    const noToken = await request.patch(`/api/pastes/${slug}`, {
      data: { isEncrypted: false, content: 'hijacked', title: null, language: 'plaintext', expiration: '1d' },
    });
    expect(noToken.status()).toBe(401);

    const forged = await request.patch(`/api/pastes/${slug}`, {
      headers: { 'x-tinypaste-edit-token': 'forged-token-value' },
      data: { isEncrypted: false, content: 'hijacked', title: null, language: 'plaintext', expiration: '1d' },
    });
    expect(forged.status()).toBe(403);

    const deletion = await request.delete(`/api/pastes/${slug}`, {
      headers: { 'x-tinypaste-edit-token': 'forged-token-value' },
    });
    expect(deletion.status()).toBe(403);

    // The original content must be untouched.
    expect(await (await request.get(`/p/${slug}/raw`)).text()).toBe('protected by token');
  });

  test('shows an explanation on the edit page when the browser has no token', async ({ page, context }) => {
    const url = await createPaste(page, { content: 'someone elses paste' });
    const slug = new URL(url).pathname.split('/')[2];

    const stranger = await context.browser()!.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(`/p/${slug}/edit`);

    await expect(strangerPage.getByRole('heading', { name: /cannot be edited here/i })).toBeVisible();
    await stranger.close();
  });
});

test.describe('deleting', () => {
  test('requires confirmation and then removes the paste', async ({ page }) => {
    const url = await createPaste(page, { content: 'delete me' });
    const target = recipientUrl(url);

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expectVisibleText(page, 'delete me');

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete paste' }).click();
    await page.waitForURL(/\/\?deleted=1$/);

    await page.goto(target);
    await expect(page.getByRole('heading', { name: 'Paste not found.' })).toBeVisible();
  });

  test('removes the paste from local history', async ({ page }) => {
    const url = await createPaste(page, { content: 'history entry', title: 'Tracked' });

    await page.goto('/recent');
    await expect(page.getByRole('link', { name: 'Tracked' })).toBeVisible();

    await page.goto(recipientUrl(url));
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete paste' }).click();
    await page.waitForURL(/\/\?deleted=1$/);

    await page.goto('/recent');
    await expect(page.getByRole('link', { name: 'Tracked' })).toHaveCount(0);
  });
});

test.describe('deleting a burned paste', () => {
  test('the creator can remove the leftover record from the burned screen', async ({ page }) => {
    const url = await createPaste(page, {
      content: 'burn then delete',
      title: 'Leftover',
      burnAfterRead: true,
    });
    const target = recipientUrl(url);

    // Consume it, so the paste becomes unreadable and the viewer no longer renders.
    await page.goto(target);
    await page.getByRole('button', { name: /Reveal and destroy/ }).click();
    await expect(page.locator('pre')).toContainText('burn then delete');

    await page.goto(target);
    await expect(page.getByRole('heading', { name: 'This paste is no longer available.' })).toBeVisible();

    // The creator's browser holds the edit token, so deletion is offered here.
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await page.getByRole('button', { name: 'Delete paste' }).click();
    await expect(page.getByText('Deleted. Nothing for this link remains stored.')).toBeVisible();

    // The row is gone, so the state changes from "burned" to "not found".
    await page.goto(target);
    await expect(page.getByRole('heading', { name: 'Paste not found.' })).toBeVisible();
  });

  test('a stranger is not offered deletion on the burned screen', async ({ page, context }) => {
    const url = await createPaste(page, { content: 'not yours to delete', burnAfterRead: true });
    const target = recipientUrl(url);

    await page.goto(target);
    await page.getByRole('button', { name: /Reveal and destroy/ }).click();
    await expect(page.locator('pre')).toContainText('not yours to delete');

    const stranger = await context.browser()!.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(target);
    await expect(
      strangerPage.getByRole('heading', { name: 'This paste is no longer available.' }),
    ).toBeVisible();
    await expect(strangerPage.getByRole('button', { name: 'Delete permanently' })).toHaveCount(0);
    await stranger.close();
  });

  test('the API refuses a forged token even though the read gate is bypassed', async ({ page, request }) => {
    const url = await createPaste(page, { content: 'guarded leftover', burnAfterRead: true });
    const slug = new URL(url).pathname.split('/')[2];

    await request.post(`/api/pastes/${slug}/reveal`);

    const forged = await request.delete(`/api/pastes/${slug}`, {
      headers: { 'x-tinypaste-edit-token': 'forged-token-value' },
    });
    expect(forged.status()).toBe(403);

    const noToken = await request.delete(`/api/pastes/${slug}`);
    expect(noToken.status()).toBe(401);
  });
});

test.describe('recent pastes', () => {
  test('lists pastes from this browser only', async ({ page, context }) => {
    await createPaste(page, { content: 'mine one', title: 'Mine One' });
    await createPaste(page, { content: 'mine two', title: 'Mine Two' });

    await page.goto('/recent');
    await expect(page.getByRole('link', { name: 'Mine One' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mine Two' })).toBeVisible();

    const stranger = await context.browser()!.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto('/recent');
    await expect(strangerPage.getByText('No recent pastes')).toBeVisible();
    await stranger.close();
  });

  test('can forget a single paste without deleting it', async ({ page }) => {
    const url = await createPaste(page, { content: 'still online', title: 'Forgettable' });

    await page.goto('/recent');
    await page.getByRole('button', { name: /Remove Forgettable/ }).click();
    await expect(page.getByRole('link', { name: 'Forgettable' })).toHaveCount(0);

    // Forgetting is local: the paste itself is untouched.
    await page.goto(recipientUrl(url));
    await expectVisibleText(page, 'still online');
  });
});

test.describe('keyboard and palette', () => {
  test('creates a paste with Ctrl+Enter', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    await fillCodeEditor(page, 'created with the keyboard');
    await page.keyboard.press('Control+Enter');

    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);
    await expectVisibleText(page, 'created with the keyboard');
  });

  test('opens the command palette with Ctrl+K', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    await page.keyboard.press('Control+k');

    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();

    await page.getByPlaceholder('Type a command…').fill('recent');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/recent$/);
  });

  test('clears the editor from the palette', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    await fillCodeEditor(page, 'to be cleared');

    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Type a command…').fill('clear');
    await page.keyboard.press('Enter');

    await expectCodeEditorValue(page, '');
  });
});
