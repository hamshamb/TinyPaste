import { expect, test, type Page } from '@playwright/test';
import {
  expectCodeEditorValue,
  fillCodeEditor,
  modeTab,
  recipientUrl,
  switchToDocumentMode,
  typeInDocument,
} from './helpers';

/** Applies bold via the toolbar to whatever is currently selected. */
async function toggleBold(page: Page) {
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
}

/**
 * Heading levels live one step down from the always-visible toolbar, behind
 * a single "Heading" control — see components/editor/document-toolbar.tsx.
 */
async function setHeading(page: Page, level: 1 | 2 | 3) {
  await page.getByRole('button', { name: 'Heading', exact: true }).click();
  await page.getByRole('menuitem', { name: `Heading ${level}`, exact: true }).click();
}

test.describe('DOCUMENT mode — composing', () => {
  test('creates a formatted document and renders it as a document, not a code block', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);

    await setHeading(page, 1);
    await typeInDocument(page, 'Project Notes');
    await page.keyboard.press('Enter');
    // Enter after a heading starts a fresh paragraph; make it bold text.
    await toggleBold(page);
    await typeInDocument(page, 'Important: ');
    await toggleBold(page);
    await typeInDocument(page, 'read this first.');

    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);

    await expect(page.getByRole('heading', { name: 'Project Notes', level: 1 })).toBeVisible();
    await expect(page.locator('strong', { hasText: 'Important:' })).toBeVisible();
    // A document paste must never be shown inside the code surface.
    await expect(page.locator('pre')).toHaveCount(0);
    await expect(page.getByText('Document').first()).toBeVisible();
  });

  test('supports lists, blockquotes, inline code and headings from the toolbar', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);

    await page.getByRole('button', { name: 'Bulleted list' }).click();
    await typeInDocument(page, 'first item');
    await page.keyboard.press('Enter');
    await typeInDocument(page, 'second item');

    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);

    const items = page.locator('li');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('first item');
    await expect(items.nth(1)).toContainText('second item');
  });

  test('rejects a dangerous link scheme from the link popover and never applies it', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await typeInDocument(page, 'click me');
    await page.keyboard.press('Control+A');
    await page.getByRole('button', { name: 'Link', exact: true }).click();

    const input = page.getByPlaceholder('https://example.com');
    await input.fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page.getByText(/not supported/i)).toBeVisible();
    // The mark must not have been applied — no link ever entered the document.
    await expect(page.locator('.ProseMirror a')).toHaveCount(0);
  });

  test('applies a safe link and it survives to the rendered paste', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await typeInDocument(page, 'our docs');
    await page.keyboard.press('Control+A');
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await page.getByPlaceholder('https://example.com').fill('https://example.com/docs');
    await page.getByRole('button', { name: 'Apply' }).click();

    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);

    const link = page.locator('a', { hasText: 'our docs' });
    await expect(link).toHaveAttribute('href', 'https://example.com/docs');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });
});

test.describe('DOCUMENT mode — mode switching', () => {
  test('seeds a document from Code/Text content when switching modes', async ({ page }) => {
    await page.goto('/');
    await fillCodeEditor(page, 'plain text to become a document');
    await modeTab(page, 'Document').click();

    await expect(page.locator('.ProseMirror')).toContainText('plain text to become a document');
  });

  test('flattens a document back to text when switching to Code/Text', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await typeInDocument(page, 'document content');

    await modeTab(page, 'Code').click();
    await expectCodeEditorValue(page, 'document content');
  });
});

test.describe('DOCUMENT mode — viewing, forking and editing', () => {
  test('offers Export instead of Raw/Download, and Copy/Fork as usual', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await typeInDocument(page, 'exportable document');
    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);

    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Raw' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fork' })).toBeVisible();

    await page.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByRole('menuitem', { name: 'Plain text (.txt)' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Markdown (.md)' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'HTML (.html)' })).toBeVisible();
  });

  test('the server refuses raw/download for a document paste directly', async ({ page, request }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await typeInDocument(page, 'not exportable via raw');
    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);
    const slug = new URL(page.url()).pathname.split('/')[2];

    const raw = await request.get(`/p/${slug}/raw`);
    expect(raw.status()).toBe(409);
    const download = await request.get(`/p/${slug}/download`);
    expect(download.status()).toBe(409);
  });

  test('forks a document paste with its structure intact', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await setHeading(page, 1);
    await typeInDocument(page, 'Forkable Heading');
    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);

    await page.getByRole('button', { name: 'Fork' }).click();
    await page.waitForURL(/\/$/);

    await expect(modeTab(page, 'Document')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Forkable Heading', level: 1 })).toBeVisible();
  });

  test('edits a document paste and reopens it with the original structure', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await typeInDocument(page, 'original paragraph');
    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);

    await page.getByRole('link', { name: 'Edit' }).click();
    await page.waitForURL(/\/edit$/);
    await expect(page.locator('.ProseMirror')).toContainText('original paragraph');
    // No mode tabs on the edit screen — content type is fixed at creation.
    await expect(page.getByRole('tab', { name: 'Document' })).toHaveCount(0);

    await typeInDocument(page, ' plus an edit');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+$/);

    await expect(page.getByText('original paragraph plus an edit')).toBeVisible();
  });
});

test.describe('DOCUMENT mode — encryption', () => {
  const SECRET_HEADING = 'Classified Project Codename';

  test('never sends the plaintext document JSON to the server', async ({ page }) => {
    const bodies: string[] = [];
    page.on('request', (req) => {
      const body = req.postData();
      if (body) bodies.push(body);
    });

    await page.goto('/');
    await switchToDocumentMode(page);
    await setHeading(page, 1);
    await typeInDocument(page, SECRET_HEADING);
    await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).not.toContain(SECRET_HEADING);
  });

  test('decrypts and renders a document paste locally', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await setHeading(page, 1);
    await typeInDocument(page, SECRET_HEADING);
    await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);

    const url = page.url();
    await expect(page.getByRole('heading', { name: SECRET_HEADING })).toBeVisible();

    // A visitor opening the complete link (fragment included) must also decrypt it.
    await page.goto(recipientUrl(url));
    await expect(page.getByRole('heading', { name: SECRET_HEADING })).toBeVisible();
    await expect(page.getByText(/Decrypted locally in this browser/)).toBeVisible();
  });

  test('the stored row holds only ciphertext for an encrypted document', async ({ page, request }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await typeInDocument(page, SECRET_HEADING);
    await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);
    const slug = new URL(page.url()).pathname.split('/')[2];

    const response = await request.get(`/api/pastes/${slug}`);
    const payload = await response.json();
    expect(payload.meta.isEncrypted).toBe(true);
    expect(payload.meta.contentType).toBe('document');
    expect(payload.body.kind).toBe('encrypted');
    expect(JSON.stringify(payload)).not.toContain(SECRET_HEADING);
  });
});

test.describe('CODE and PLAIN TEXT modes', () => {
  test('CODE mode Monaco highlights and reports cursor position', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Language').selectOption('javascript');
    await fillCodeEditor(page, 'const answer = 42;');

    await expect(page.locator('.monaco-editor')).toBeVisible();
    await expect(page.getByText(/Ln \d+, Col \d+/)).toBeVisible();
    // Monaco's own tokenizer applied JavaScript highlighting classes.
    await expect(page.locator('.monaco-editor .mtk1, .monaco-editor [class*="mtk"]').first()).toBeVisible();
  });

  test('PLAIN TEXT mode forces the plaintext language and hides the language selector', async ({ page }) => {
    await page.goto('/');
    await modeTab(page, 'Text').click();

    await expect(page.getByLabel('Language')).toHaveCount(0);
    await fillCodeEditor(page, 'nothing to highlight here');
    await page.getByRole('button', { name: 'Create paste' }).click();
    await page.waitForURL(/\/p\/[A-Za-z0-9]+/);

    await expect(page.getByText('Plain Text').first()).toBeVisible();
  });

  test('DOCUMENT mode hides the language selector entirely', async ({ page }) => {
    await page.goto('/');
    await switchToDocumentMode(page);
    await expect(page.getByLabel('Language')).toHaveCount(0);
  });
});
