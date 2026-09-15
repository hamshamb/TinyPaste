/**
 * Supported languages. `id` is stored in the database, `shiki` is the grammar
 * name loaded on demand, `extension` drives download filenames.
 */
export type LanguageDefinition = {
  id: string;
  label: string;
  /** Shiki grammar id, or null for unhighlighted plain text. */
  shiki: string | null;
  extension: string;
  /** MIME type used by the raw route. */
  mime: string;
};

export const LANGUAGES = [
  { id: 'plaintext', label: 'Plain Text', shiki: null, extension: 'txt', mime: 'text/plain' },
  { id: 'javascript', label: 'JavaScript', shiki: 'javascript', extension: 'js', mime: 'text/plain' },
  { id: 'typescript', label: 'TypeScript', shiki: 'typescript', extension: 'ts', mime: 'text/plain' },
  { id: 'jsx', label: 'JSX', shiki: 'jsx', extension: 'jsx', mime: 'text/plain' },
  { id: 'tsx', label: 'TSX', shiki: 'tsx', extension: 'tsx', mime: 'text/plain' },
  { id: 'python', label: 'Python', shiki: 'python', extension: 'py', mime: 'text/plain' },
  { id: 'java', label: 'Java', shiki: 'java', extension: 'java', mime: 'text/plain' },
  { id: 'c', label: 'C', shiki: 'c', extension: 'c', mime: 'text/plain' },
  { id: 'cpp', label: 'C++', shiki: 'cpp', extension: 'cpp', mime: 'text/plain' },
  { id: 'csharp', label: 'C#', shiki: 'csharp', extension: 'cs', mime: 'text/plain' },
  { id: 'go', label: 'Go', shiki: 'go', extension: 'go', mime: 'text/plain' },
  { id: 'rust', label: 'Rust', shiki: 'rust', extension: 'rs', mime: 'text/plain' },
  { id: 'php', label: 'PHP', shiki: 'php', extension: 'php', mime: 'text/plain' },
  { id: 'ruby', label: 'Ruby', shiki: 'ruby', extension: 'rb', mime: 'text/plain' },
  { id: 'swift', label: 'Swift', shiki: 'swift', extension: 'swift', mime: 'text/plain' },
  { id: 'kotlin', label: 'Kotlin', shiki: 'kotlin', extension: 'kt', mime: 'text/plain' },
  { id: 'json', label: 'JSON', shiki: 'json', extension: 'json', mime: 'text/plain' },
  { id: 'yaml', label: 'YAML', shiki: 'yaml', extension: 'yaml', mime: 'text/plain' },
  { id: 'xml', label: 'XML', shiki: 'xml', extension: 'xml', mime: 'text/plain' },
  { id: 'html', label: 'HTML', shiki: 'html', extension: 'html', mime: 'text/plain' },
  { id: 'css', label: 'CSS', shiki: 'css', extension: 'css', mime: 'text/plain' },
  { id: 'scss', label: 'SCSS', shiki: 'scss', extension: 'scss', mime: 'text/plain' },
  { id: 'markdown', label: 'Markdown', shiki: 'markdown', extension: 'md', mime: 'text/plain' },
  { id: 'sql', label: 'SQL', shiki: 'sql', extension: 'sql', mime: 'text/plain' },
  { id: 'bash', label: 'Bash', shiki: 'bash', extension: 'sh', mime: 'text/plain' },
  { id: 'powershell', label: 'PowerShell', shiki: 'powershell', extension: 'ps1', mime: 'text/plain' },
  { id: 'dockerfile', label: 'Dockerfile', shiki: 'dockerfile', extension: 'Dockerfile', mime: 'text/plain' },
  { id: 'toml', label: 'TOML', shiki: 'toml', extension: 'toml', mime: 'text/plain' },
  { id: 'ini', label: 'INI', shiki: 'ini', extension: 'ini', mime: 'text/plain' },
  { id: 'diff', label: 'Diff', shiki: 'diff', extension: 'diff', mime: 'text/plain' },
  { id: 'graphql', label: 'GraphQL', shiki: 'graphql', extension: 'graphql', mime: 'text/plain' },
  { id: 'log', label: 'Log', shiki: 'log', extension: 'log', mime: 'text/plain' },
] as const satisfies readonly LanguageDefinition[];

export type LanguageId = (typeof LANGUAGES)[number]['id'];

export const DEFAULT_LANGUAGE: LanguageId = 'plaintext';

const LANGUAGE_MAP = new Map<string, LanguageDefinition>(LANGUAGES.map((l) => [l.id, l]));

export const LANGUAGE_IDS: readonly LanguageId[] = LANGUAGES.map((l) => l.id);

export function isLanguageId(value: unknown): value is LanguageId {
  return typeof value === 'string' && LANGUAGE_MAP.has(value);
}

export function getLanguage(id: string): LanguageDefinition {
  return LANGUAGE_MAP.get(id) ?? LANGUAGE_MAP.get(DEFAULT_LANGUAGE)!;
}

export function languageLabel(id: string): string {
  return getLanguage(id).label;
}

/** File extension for a language id. Unknown ids fall back to `txt`. */
export function languageExtension(id: string): string {
  return getLanguage(id).extension;
}
