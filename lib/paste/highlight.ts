import { createHighlighterCore, type HighlighterCore, type ThemedToken } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { GRAMMAR_LOADERS } from './grammars';
import { getLanguage } from './languages';

/**
 * Syntax highlighting.
 *
 * Two deliberate choices:
 *
 *  1. `codeToTokens`, not `codeToHtml`. Tokens are rendered as React elements,
 *     so pasted content can never be interpreted as markup — there is no
 *     dangerouslySetInnerHTML anywhere in the render path.
 *  2. The JavaScript regex engine and per-language dynamic imports, so a page
 *     ships one grammar instead of the full ~2 MB bundle, and no WASM is needed.
 *     `forgiving` lets a grammar the JS engine cannot compile degrade to plain
 *     text rather than throw.
 */

export const LIGHT_THEME = 'github-light';
export const DARK_THEME = 'github-dark-dimmed';

export type HighlightLine = Array<{ content: string; style: Record<string, string> }>;

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLanguages = new Set<string>();

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('@shikijs/themes/github-light'), import('@shikijs/themes/github-dark-dimmed')],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }
  return highlighterPromise;
}

async function ensureLanguage(highlighter: HighlighterCore, grammar: string): Promise<boolean> {
  if (loadedLanguages.has(grammar)) return true;
  const loader = GRAMMAR_LOADERS[grammar];
  if (!loader) return false;
  try {
    const registration = await loader();
    await highlighter.loadLanguage(registration.default);
    loadedLanguages.add(grammar);
    return true;
  } catch {
    // An unavailable grammar is not an error condition — fall back to plain text.
    return false;
  }
}

/** Split text into lines of unstyled tokens. Used as the plain-text fallback. */
function plainLines(code: string): HighlightLine[] {
  return code.split('\n').map((line) => (line.length ? [{ content: line, style: {} }] : []));
}

function toStyle(token: ThemedToken): Record<string, string> {
  // With `defaultColor: false` Shiki emits --shiki-light / --shiki-dark custom
  // properties per token, so a theme switch is pure CSS (see globals.css).
  const raw = (token as ThemedToken & { htmlStyle?: Record<string, string> | string }).htmlStyle;
  if (!raw) return token.color ? { color: token.color } : {};
  if (typeof raw === 'string') {
    const style: Record<string, string> = {};
    for (const declaration of raw.split(';')) {
      const [property, value] = declaration.split(':');
      if (property && value) style[property.trim()] = value.trim();
    }
    return style;
  }
  return raw;
}

/**
 * Highlight `code` for a TinyPaste language id.
 *
 * Never throws: any failure returns unhighlighted lines so a paste always
 * renders.
 */
export async function highlightToLines(code: string, languageId: string): Promise<HighlightLine[]> {
  const language = getLanguage(languageId);
  if (!language.shiki || code.length === 0) return plainLines(code);

  try {
    const highlighter = await getHighlighter();
    if (!(await ensureLanguage(highlighter, language.shiki))) return plainLines(code);

    const result = highlighter.codeToTokens(code, {
      lang: language.shiki,
      themes: { light: LIGHT_THEME, dark: DARK_THEME },
      defaultColor: false,
    });

    return result.tokens.map((line) =>
      line.map((token) => ({ content: token.content, style: toStyle(token) })),
    );
  } catch {
    return plainLines(code);
  }
}
