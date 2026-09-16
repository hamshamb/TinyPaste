import type { TinyPasteDoc } from './schema';

/** A document with a single empty paragraph — what a fresh Tiptap editor starts from. */
export function emptyDocument(): TinyPasteDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/**
 * Seed a document from plain text, one paragraph per line.
 *
 * Used only for the editor's mode switch (Code/Plain Text → Document), so
 * someone who typed a few lines before deciding they wanted rich text does
 * not lose them. Blank lines become empty paragraphs rather than being
 * dropped, so line count is preserved.
 */
export function textToDocument(text: string): TinyPasteDoc {
  const lines = text.split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => (line.length > 0 ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
  };
}
