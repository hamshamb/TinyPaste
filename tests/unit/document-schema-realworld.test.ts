import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocumentJson } from '@/lib/document/schema';

/**
 * Regression coverage using JSON captured directly from a live Tiptap editor
 * exercising every toolbar feature (headings, marks, alignment, lists, a
 * nested blockquote/list/code-block, links with the editor's default
 * HTMLAttributes, colour and highlight) — this is what caught the schema
 * missing Link's `title` attribute and OrderedList's `type` attribute, both
 * real Tiptap defaults that a hand-written schema is easy to miss.
 */
describe('parseDocumentJson — real editor output', () => {
  it('accepts a document generated from every DOCUMENT mode toolbar feature', () => {
    const raw = readFileSync(new URL('./fixtures/full-document.json', import.meta.url), 'utf8');
    expect(() => parseDocumentJson(raw)).not.toThrow();
  });
});
