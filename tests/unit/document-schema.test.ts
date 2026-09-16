import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_MAX_DEPTH,
  DocumentValidationError,
  isValidDocumentJson,
  parseDocumentJson,
} from '@/lib/document/schema';
import { docToMarkdown } from '@/lib/document/markdown';
import { docToPlainText } from '@/lib/document/plain-text';
import { emptyDocument, textToDocument } from '@/lib/document/empty';

const richDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' and ' },
        {
          type: 'text',
          text: 'a link',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
      ],
    },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }] },
    { type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: 'const x = 1;' }] },
    { type: 'horizontalRule' },
  ],
};

describe('parseDocumentJson — accepts', () => {
  it('parses a well-formed document with headings, marks, lists, quotes and code', () => {
    const parsed = parseDocumentJson(JSON.stringify(richDoc));
    expect(parsed.type).toBe('doc');
    expect(parsed.content).toHaveLength(6);
  });

  it('accepts an empty document', () => {
    expect(() => parseDocumentJson(JSON.stringify(emptyDocument()))).not.toThrow();
  });

  it('accepts textStyle and highlight marks with a safe colour', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'coloured',
              marks: [
                { type: 'textStyle', attrs: { color: '#ff0000' } },
                { type: 'highlight', attrs: { color: 'rgb(10, 20, 30)' } },
              ],
            },
          ],
        },
      ],
    };
    expect(() => parseDocumentJson(JSON.stringify(doc))).not.toThrow();
  });

  it('accepts mailto and relative/anchor links', () => {
    for (const href of ['mailto:person@example.com', '/p/abc123', '#section']) {
      const doc = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }] },
        ],
      };
      expect(isValidDocumentJson(JSON.stringify(doc))).toBe(true);
    }
  });
});

describe('parseDocumentJson — rejects', () => {
  it('rejects malformed JSON', () => {
    expect(() => parseDocumentJson('{not json')).toThrow(DocumentValidationError);
  });

  it('rejects a node type outside the supported schema', () => {
    const doc = { type: 'doc', content: [{ type: 'iframe', attrs: { src: 'https://evil.example' } }] };
    expect(() => parseDocumentJson(JSON.stringify(doc))).toThrow(DocumentValidationError);
  });

  it('rejects an unsupported mark type', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'script' }] }] }],
    };
    expect(() => parseDocumentJson(JSON.stringify(doc))).toThrow(DocumentValidationError);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'JaVaScRiPt:alert(1)'])(
    'rejects a dangerous link scheme: %s',
    (href) => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }] },
        ],
      };
      expect(() => parseDocumentJson(JSON.stringify(doc))).toThrow(DocumentValidationError);
    },
  );

  it('rejects an unsafe colour value, including a CSS injection attempt', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'textStyle', attrs: { color: 'red; background: url(javascript:alert(1))' } }],
            },
          ],
        },
      ],
    };
    expect(() => parseDocumentJson(JSON.stringify(doc))).toThrow(DocumentValidationError);
  });

  it('rejects a heading level outside 1-3', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 5 }, content: [] }] };
    expect(() => parseDocumentJson(JSON.stringify(doc))).toThrow(DocumentValidationError);
  });

  it('rejects a document nested deeper than the configured limit', () => {
    let node: unknown = { type: 'paragraph', content: [{ type: 'text', text: 'leaf' }] };
    for (let i = 0; i < DOCUMENT_MAX_DEPTH + 10; i += 1) {
      node = { type: 'blockquote', content: [node] };
    }
    const doc = { type: 'doc', content: [node] };
    expect(() => parseDocumentJson(JSON.stringify(doc))).toThrow(DocumentValidationError);
  });

  it('rejects an empty list', () => {
    const doc = { type: 'doc', content: [{ type: 'bulletList', content: [] }] };
    expect(() => parseDocumentJson(JSON.stringify(doc))).toThrow(DocumentValidationError);
  });

  it('rejects an unknown top-level type', () => {
    expect(() => parseDocumentJson(JSON.stringify({ type: 'not-a-doc', content: [] }))).toThrow(
      DocumentValidationError,
    );
  });
});

describe('docToPlainText', () => {
  it('flattens headings, paragraphs, lists, quotes and code to readable plain text', () => {
    const text = docToPlainText(parseDocumentJson(JSON.stringify(richDoc)));
    expect(text).toContain('Title');
    expect(text).toContain('Hello bold and a link');
    expect(text).toContain('- one');
    expect(text).toContain('- two');
    expect(text).toContain('> quoted');
    expect(text).toContain('const x = 1;');
  });

  it('round-trips a seeded plain-text document', () => {
    const seeded = textToDocument('first line\n\nthird line');
    const text = docToPlainText(seeded);
    expect(text.split('\n')).toEqual(['first line', '', 'third line']);
  });
});

describe('docToMarkdown', () => {
  it('renders headings, bold, links, lists, quotes and fenced code', () => {
    const md = docToMarkdown(parseDocumentJson(JSON.stringify(richDoc)));
    expect(md).toContain('# Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('[a link](https://example.com)');
    expect(md).toContain('- one');
    expect(md).toContain('> quoted');
    expect(md).toContain('```javascript\nconst x = 1;\n```');
  });
});
