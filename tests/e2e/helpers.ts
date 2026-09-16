import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type * as Monaco from 'monaco-editor';

export type CreateOptions = {
  content: string;
  title?: string;
  language?: string;
  expiration?: string;
  password?: string;
  burnAfterRead?: boolean;
  encrypt?: boolean;
};

/**
 * Security options are toolbar toggles rather than checkboxes: they carry
 * aria-pressed, so `check()` does not apply and the state is asserted directly.
 */
export function securityToggle(page: Page, name: 'Password' | 'Burn once' | 'Encrypt') {
  return page.getByRole('button', { name, exact: true });
}

async function setToggle(page: Page, name: 'Password' | 'Burn once' | 'Encrypt'): Promise<void> {
  const toggle = securityToggle(page, name);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

/** The Code/Text/Document segmented control above the editor. */
export function modeTab(page: Page, name: 'Code' | 'Text' | 'Document') {
  return page.getByRole('tab', { name, exact: true });
}

/**
 * Set CODE/PLAIN TEXT mode's content through Monaco's own `setValue` API
 * rather than typing it, and wait for TinyPaste's own character counter to
 * confirm the change reached React state.
 *
 * Keystroke-by-keystroke typing would fight the very editing behaviour these
 * modes exist to provide: HTML's auto-closing tags and bracket/quote
 * auto-closing can turn a literal payload like `<script>...</script>` into
 * something else entirely if it is typed rather than set outright — exactly
 * the kind of thing tests/e2e/paste.spec.ts's XSS cases must not do by accident.
 * `setValue` is a real, public Monaco API: it goes through the same model
 * change pipeline a keystroke does, which is what lets @monaco-editor/react's
 * onChange wiring (and so TinyPaste's own React state) pick it up normally.
 */
export async function fillCodeEditor(page: Page, content: string): Promise<void> {
  await page.locator('.monaco-editor').first().waitFor();
  await page.evaluate((text) => {
    const monaco = (window as unknown as { monaco: typeof Monaco }).monaco;
    const editor = monaco.editor.getEditors()[0];
    editor.setValue(text);
    const model = editor.getModel();
    if (model) editor.setPosition(model.getFullModelRange().getEndPosition());
  }, content);
  await expect(page.getByText(`${content.length.toLocaleString()} chars`)).toBeVisible();
}

export async function getCodeEditorValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco: typeof Monaco }).monaco;
    return monaco.editor.getEditors()[0]?.getValue() ?? '';
  });
}

/** Assert Monaco's current model value — the CODE/PLAIN TEXT equivalent of `toHaveValue`. */
export async function expectCodeEditorValue(page: Page, expected: string): Promise<void> {
  await page.locator('.monaco-editor').first().waitFor();
  await expect.poll(() => getCodeEditorValue(page)).toBe(expected);
}

/** Fill in the create form and submit it, returning the resulting paste URL. */
export async function createPaste(page: Page, options: CreateOptions): Promise<string> {
  await page.goto('/');

  if (options.title) await page.getByLabel('Title').fill(options.title);
  if (options.language) await page.getByLabel('Language').selectOption(options.language);
  await fillCodeEditor(page, options.content);
  if (options.expiration) await page.getByLabel('Expiration').selectOption(options.expiration);

  // Encryption and password protection are mutually exclusive, so the order
  // here matters: whichever is requested is applied to a clean state.
  if (options.encrypt) await setToggle(page, 'Encrypt');
  if (options.burnAfterRead) await setToggle(page, 'Burn once');
  if (options.password) {
    await setToggle(page, 'Password');
    await page.getByLabel('Password', { exact: true }).fill(options.password);
  }

  await page.getByRole('button', { name: 'Create paste' }).click();
  await page.waitForURL(/\/p\/[A-Za-z0-9]+/);
  return page.url();
}

/**
 * Switch to DOCUMENT mode and type into Tiptap.
 *
 * Unlike Monaco, ProseMirror's plain-paragraph typing has no auto-closing
 * behaviour to fight, so real keystrokes (needed anyway to exercise actual
 * marks/shortcuts in a given test) are the natural choice here.
 */
export async function switchToDocumentMode(page: Page): Promise<void> {
  await modeTab(page, 'Document').click();
  await page.locator('.ProseMirror').waitFor();
}

/**
 * Types into the DOCUMENT editor, focusing it only if it is not already
 * focused.
 *
 * A click always lands at a *coordinate*, and StarterKit's TrailingNode
 * extension keeps an empty paragraph after a heading/list so there is always
 * somewhere normal to keep typing — so re-clicking the editor's bounding box
 * right after a toolbar button (say, Heading 1) can land in that trailing
 * paragraph instead of the block the button just created, exactly as a stray
 * click would for a real user. A real user does not re-click between pressing
 * a toolbar button and typing; the caret is already blinking where the
 * command left it.
 */
export async function typeInDocument(page: Page, text: string): Promise<void> {
  const editor = page.locator('.ProseMirror');
  const alreadyFocused = await editor.evaluate((el) => el === document.activeElement);
  if (!alreadyFocused) await editor.click();
  await page.keyboard.type(text);
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
 * a key pressed between `load` and hydration is simply dropped. The burn toggle
 * is server-rendered with aria-pressed="false" and only flips once React is
 * listening, which makes it a reliable readiness signal — and toggling it twice
 * leaves the form exactly as it was found.
 */
export async function waitForHydration(page: Page): Promise<void> {
  const toggle = securityToggle(page, 'Burn once');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
}
