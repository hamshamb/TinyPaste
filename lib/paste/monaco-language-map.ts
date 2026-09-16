/**
 * TinyPaste language id -> Monaco's own language id.
 *
 * Monaco ships a fixed set of Monarch tokenizers (see `monaco-editor/min/vs`),
 * which does not line up one-to-one with lib/paste/languages.ts — most
 * usefully, it has no distinct grammar for JSX/TSX (its "javascript" and
 * "typescript" tokenizers already handle JSX syntax reasonably) and none at
 * all for TOML, diff or log output. Those fall back to the closest available
 * highlighting rather than none, or to 'plaintext' where nothing is close.
 *
 * This only governs the *editor's* highlighting. The read-only paste view
 * keeps using Shiki (components/paste/code-block.tsx), which supports the
 * full list natively, so nothing is lost there.
 */
const MONACO_LANGUAGE_MAP: Record<string, string> = {
  plaintext: 'plaintext',
  javascript: 'javascript',
  typescript: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  python: 'python',
  java: 'java',
  c: 'cpp',
  cpp: 'cpp',
  csharp: 'csharp',
  go: 'go',
  rust: 'rust',
  php: 'php',
  ruby: 'ruby',
  swift: 'swift',
  kotlin: 'kotlin',
  json: 'json',
  yaml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  markdown: 'markdown',
  sql: 'sql',
  bash: 'shell',
  powershell: 'powershell',
  dockerfile: 'dockerfile',
  toml: 'ini',
  ini: 'ini',
  diff: 'plaintext',
  graphql: 'graphql',
  log: 'plaintext',
};

export function toMonacoLanguage(languageId: string): string {
  return MONACO_LANGUAGE_MAP[languageId] ?? 'plaintext';
}
