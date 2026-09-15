import { describe, expect, it } from 'vitest';
import {
  buildDownloadFilename,
  contentDispositionAttachment,
  sanitizeFilenameBase,
} from '@/lib/utils/filename';
import { LANGUAGES, languageExtension } from '@/lib/paste/languages';

describe('sanitizeFilenameBase', () => {
  it('keeps an ordinary title, with spaces collapsed to hyphens', () => {
    expect(sanitizeFilenameBase('My API notes', 'fallback')).toBe('My-API-notes');
  });

  it('falls back for an empty or whitespace-only title', () => {
    expect(sanitizeFilenameBase('', 'fallback')).toBe('fallback');
    expect(sanitizeFilenameBase('   ', 'fallback')).toBe('fallback');
    expect(sanitizeFilenameBase(null, 'fallback')).toBe('fallback');
    expect(sanitizeFilenameBase(undefined, 'fallback')).toBe('fallback');
  });

  it.each([
    ['posix traversal', '../../etc/passwd'],
    ['windows traversal', '..\\..\\windows\\system32'],
    ['absolute posix path', '/etc/shadow'],
    ['absolute windows path', 'C:\\Users\\admin\\secrets'],
    ['bare dots', '..'],
    ['leading dot', '.bashrc'],
  ])('neutralises %s', (_label, title) => {
    const result = sanitizeFilenameBase(title, 'fallback');
    expect(result).not.toContain('/');
    expect(result).not.toContain('\\');
    expect(result).not.toContain('..');
    expect(result.startsWith('.')).toBe(false);
  });

  it('removes characters that would break a Content-Disposition header', () => {
    const result = sanitizeFilenameBase('evil"; filename="owned.sh', 'fallback');
    expect(result).not.toContain('"');
    expect(result).not.toContain(';');
  });

  it('removes CR and LF so a title cannot inject a header', () => {
    const result = sanitizeFilenameBase('notes\r\nSet-Cookie: admin=1', 'fallback');
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\n');
  });

  it('strips NUL and other control characters', () => {
    const result = sanitizeFilenameBase('bad\u0000name\u0007here', 'fallback');
    expect(result).toBe('badnamehere');
  });

  it('replaces Windows-illegal characters', () => {
    const result = sanitizeFilenameBase('a:b*c?d<e>f|g', 'fallback');
    for (const char of [':', '*', '?', '<', '>', '|']) {
      expect(result).not.toContain(char);
    }
  });

  it('falls back for reserved Windows device names', () => {
    expect(sanitizeFilenameBase('CON', 'fallback')).toBe('fallback');
    expect(sanitizeFilenameBase('nul', 'fallback')).toBe('fallback');
    expect(sanitizeFilenameBase('LPT1', 'fallback')).toBe('fallback');
  });

  it('truncates very long titles', () => {
    expect(sanitizeFilenameBase('x'.repeat(500), 'fallback').length).toBeLessThanOrEqual(64);
  });

  it('falls back when nothing survives sanitisation', () => {
    expect(sanitizeFilenameBase('///', 'fallback')).toBe('fallback');
    expect(sanitizeFilenameBase('...', 'fallback')).toBe('fallback');
  });
});

describe('buildDownloadFilename', () => {
  it.each([
    ['javascript', 'js'],
    ['typescript', 'ts'],
    ['python', 'py'],
    ['json', 'json'],
    ['markdown', 'md'],
    ['plaintext', 'txt'],
    ['rust', 'rs'],
    ['csharp', 'cs'],
    ['bash', 'sh'],
    ['powershell', 'ps1'],
  ])('maps %s to .%s', (language, extension) => {
    expect(buildDownloadFilename('notes', language, 'K8x2FmQp')).toBe(`notes.${extension}`);
  });

  it('gives every supported language a usable extension', () => {
    for (const language of LANGUAGES) {
      const name = buildDownloadFilename('file', language.id, 'K8x2FmQp');
      expect(name).not.toContain('/');
      expect(name).not.toContain('\\');
      expect(name.length).toBeGreaterThan(1);
    }
  });

  it('falls back to txt for an unknown language', () => {
    expect(languageExtension('klingon')).toBe('txt');
    expect(buildDownloadFilename('notes', 'klingon', 'K8x2FmQp')).toBe('notes.txt');
  });

  it('uses the slug when there is no usable title', () => {
    expect(buildDownloadFilename(null, 'python', 'K8x2FmQp')).toBe('tinypaste-K8x2FmQp.py');
    expect(buildDownloadFilename('../..', 'python', 'K8x2FmQp')).toBe('tinypaste-K8x2FmQp.py');
  });

  it('does not double the extension when the title already has it', () => {
    expect(buildDownloadFilename('server.ts', 'typescript', 'K8x2FmQp')).toBe('server.ts');
  });

  it('turns a Dockerfile into a suffixed name', () => {
    expect(buildDownloadFilename('build', 'dockerfile', 'K8x2FmQp')).toBe('build.dockerfile');
  });
});

describe('contentDispositionAttachment', () => {
  it('produces a quoted ASCII name plus an RFC 5987 form', () => {
    const header = contentDispositionAttachment('notes.txt');
    expect(header).toBe(`attachment; filename="notes.txt"; filename*=UTF-8''notes.txt`);
  });

  it('transliterates non-ASCII into the fallback and encodes the real name', () => {
    const header = contentDispositionAttachment('naïve-notes.txt');
    expect(header).toContain('filename="na_ve-notes.txt"');
    expect(header).toContain("filename*=UTF-8''na%C3%AFve-notes.txt");
  });

  it('never emits a raw quote, backslash or newline', () => {
    const header = contentDispositionAttachment('a"b\\c\nd.txt');
    const quoted = header.slice(header.indexOf('filename="') + 10, header.indexOf('";'));
    expect(quoted).not.toContain('"');
    expect(quoted).not.toContain('\\');
    expect(header).not.toContain('\n');
  });
});
