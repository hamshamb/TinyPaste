import { languageExtension } from '@/lib/paste/languages';

const MAX_BASENAME_LENGTH = 64;

/**
 * Characters stripped from a title before it becomes a filename.
 *
 * Path separators and drive colons would allow traversal; the quote, backslash,
 * comma and semicolon are what make Content-Disposition header injection
 * possible. Control characters (including CR and LF) are removed separately by
 * code point, so they are not listed here.
 */
const FORBIDDEN_CHARS = new Set(['/', '\\', ':', '*', '?', '"', "'", '<', '>', '|', ';', ',']);

/** Windows reserves these device names regardless of extension. */
const RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

/**
 * Reduce an arbitrary user title to a safe filename stem.
 *
 * Everything dangerous is removed rather than escaped, because the result is
 * embedded in a Content-Disposition header where a stray quote or newline would
 * let the title inject a header of its own.
 */
export function sanitizeFilenameBase(title: string | null | undefined, fallback: string): string {
  const raw = (title ?? '').normalize('NFKD');
  let cleaned = '';

  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    // C0 and C1 control characters, including CR, LF, TAB and NUL.
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) continue;
    if (FORBIDDEN_CHARS.has(char)) continue;
    cleaned += char;
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim().replace(/ /g, '-').replace(/-+/g, '-');
  // A leading dot would produce a hidden file, and a leading '..' a traversal.
  cleaned = cleaned.replace(/^[.\-]+/, '').replace(/[.\-]+$/, '');
  cleaned = cleaned.slice(0, MAX_BASENAME_LENGTH).replace(/[.\-]+$/, '');

  if (!cleaned || RESERVED_NAMES.has(cleaned.toLowerCase())) return fallback;
  return cleaned;
}

/** Build the download filename for a paste. */
export function buildDownloadFilename(
  title: string | null | undefined,
  language: string,
  slug: string,
): string {
  const base = sanitizeFilenameBase(title, `tinypaste-${slug}`);
  const extension = languageExtension(language);
  // "Dockerfile" is a whole filename rather than a suffix.
  if (extension === 'Dockerfile') return `${base}.dockerfile`;
  if (base.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) return base;
  return `${base}.${extension}`;
}

/**
 * Content-Disposition value with an ASCII fallback plus RFC 5987 encoding, so
 * non-ASCII titles survive without ever emitting a raw quote or newline.
 */
export function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
