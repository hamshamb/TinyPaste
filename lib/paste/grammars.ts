import type { LanguageRegistration } from 'shiki/core';

type GrammarLoader = () => Promise<{ default: LanguageRegistration[] }>;

/**
 * Explicit grammar map.
 *
 * A templated `import(\`@shikijs/langs/${id}\`)` would make the bundler pull the
 * entire grammar directory into the build. Listing exactly the languages the
 * product supports keeps each one a separate lazily-loaded chunk, so a page
 * downloads one grammar rather than all of them.
 */
export const GRAMMAR_LOADERS: Record<string, GrammarLoader> = {
  javascript: () => import('@shikijs/langs/javascript'),
  typescript: () => import('@shikijs/langs/typescript'),
  jsx: () => import('@shikijs/langs/jsx'),
  tsx: () => import('@shikijs/langs/tsx'),
  python: () => import('@shikijs/langs/python'),
  java: () => import('@shikijs/langs/java'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  go: () => import('@shikijs/langs/go'),
  rust: () => import('@shikijs/langs/rust'),
  php: () => import('@shikijs/langs/php'),
  ruby: () => import('@shikijs/langs/ruby'),
  swift: () => import('@shikijs/langs/swift'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  json: () => import('@shikijs/langs/json'),
  yaml: () => import('@shikijs/langs/yaml'),
  xml: () => import('@shikijs/langs/xml'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  markdown: () => import('@shikijs/langs/markdown'),
  sql: () => import('@shikijs/langs/sql'),
  bash: () => import('@shikijs/langs/bash'),
  powershell: () => import('@shikijs/langs/powershell'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  toml: () => import('@shikijs/langs/toml'),
  ini: () => import('@shikijs/langs/ini'),
  diff: () => import('@shikijs/langs/diff'),
  graphql: () => import('@shikijs/langs/graphql'),
  log: () => import('@shikijs/langs/log'),
};
