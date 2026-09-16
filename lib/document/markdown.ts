import type { TinyPasteDoc } from './schema';

type AnyMark = { type: string; attrs?: { href?: string } };
type AnyNode = {
  type: string;
  text?: string;
  marks?: AnyMark[];
  attrs?: { level?: number; language?: string | null; start?: number | null };
  content?: AnyNode[];
};

/** Markdown special characters that would otherwise reopen/close a run early. */
function escapeInline(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
}

function renderMarks(text: string, marks: AnyMark[] | undefined): string {
  if (!marks || marks.length === 0) return text;
  let rendered = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        rendered = `**${rendered}**`;
        break;
      case 'italic':
        rendered = `_${rendered}_`;
        break;
      case 'strike':
        rendered = `~~${rendered}~~`;
        break;
      case 'underline':
        rendered = `<u>${rendered}</u>`;
        break;
      case 'code':
        rendered = `\`${rendered}\``;
        break;
      case 'highlight':
        rendered = `==${rendered}==`;
        break;
      case 'link':
        // The href was already validated against the document schema's
        // allow-list of safe protocols before this document could be stored.
        if (mark.attrs?.href) rendered = `[${rendered}](${mark.attrs.href})`;
        break;
      default:
        break;
    }
  }
  return rendered;
}

function renderInline(nodes: AnyNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '  \n';
      if (node.type !== 'text') return '';
      // Marks such as code/link carry their own literal characters, so escaping
      // happens on the raw text before those wrappers are applied.
      return renderMarks(escapeInline(node.text ?? ''), node.marks);
    })
    .join('');
}

function indentBlock(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line ? prefix + line : prefix.trimEnd()))
    .join('\n');
}

function renderBlocks(nodes: AnyNode[]): string {
  return nodes.map(renderBlock).join('\n\n');
}

function renderBlock(node: AnyNode): string {
  switch (node.type) {
    case 'paragraph':
      return renderInline(node.content);
    case 'heading': {
      const level = Math.min(Math.max(node.attrs?.level ?? 1, 1), 6);
      return `${'#'.repeat(level)} ${renderInline(node.content)}`;
    }
    case 'blockquote':
      return indentBlock(renderBlocks(node.content ?? []), '> ');
    case 'codeBlock': {
      const language = node.attrs?.language ?? '';
      const code = (node.content ?? []).map((child) => child.text ?? '').join('');
      return `\`\`\`${language}\n${code}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'bulletList':
      return (node.content ?? [])
        .map((item) => indentBlock(renderBlocks(item.content ?? []), '  ').replace(/^ {2}/, '- '))
        .join('\n');
    case 'orderedList': {
      const start = node.attrs?.start ?? 1;
      return (node.content ?? [])
        .map((item, index) => {
          const marker = `${start + index}. `;
          return indentBlock(renderBlocks(item.content ?? []), ' '.repeat(marker.length)).replace(
            new RegExp(`^ {${marker.length}}`),
            marker,
          );
        })
        .join('\n');
    }
    default:
      return '';
  }
}

/** Render a validated document to GitHub-flavoured Markdown. */
export function docToMarkdown(doc: TinyPasteDoc): string {
  return renderBlocks((doc as unknown as { content: AnyNode[] }).content).trim();
}
