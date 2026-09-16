import type { ReactNode } from 'react';
import type { DocumentMark, TinyPasteDoc, TinyPasteNode } from '@/lib/document/schema';
import { isSafeHref } from '@/lib/document/safe-link';
import { isSafeCssColor } from '@/lib/document/css-color';

/**
 * Renders a validated document paste to React elements, directly from the
 * same node/mark shape lib/document/schema.ts accepted at write time.
 *
 * There is no dangerouslySetInnerHTML anywhere in this file, and no HTML
 * string ever passes through it — a document paste is JSON, and this walks
 * that JSON into elements the same way components/paste/code-block.tsx turns
 * Shiki tokens into elements instead of injecting markup. A node or mark type
 * this switch does not recognise is skipped rather than guessed at; that
 * should be unreachable for anything that passed the schema, but a renderer
 * with no HTML-injection path by construction costs nothing to also make the
 * defensive choice here.
 *
 * href and colour values are re-checked at render time as well, on the same
 * "trust nothing implicitly" principle — cheap insurance against a future
 * change to the validator ever being the last line of defence.
 */
export function DocumentRenderer({ doc, className }: { doc: TinyPasteDoc; className?: string }) {
  return (
    <div className={`tp-doc-surface ${className ?? ''}`.trim()}>
      {doc.content.map((node, index) => (
        <BlockNode key={index} node={node} />
      ))}
    </div>
  );
}

type AnyNode = TinyPasteNode & {
  type: string;
  text?: string;
  marks?: DocumentMark[];
  content?: unknown[];
  attrs?: { level?: number; textAlign?: string | null; language?: string | null; start?: number | null };
};

function textAlignStyle(node: AnyNode): React.CSSProperties | undefined {
  const align = node.attrs?.textAlign;
  return align ? { textAlign: align as React.CSSProperties['textAlign'] } : undefined;
}

function BlockNode({ node }: { node: unknown }): ReactNode {
  const n = node as AnyNode;
  const children = (n.content ?? []) as AnyNode[];

  switch (n.type) {
    case 'paragraph':
      return <p style={textAlignStyle(n)}>{renderInline(children)}</p>;
    case 'heading': {
      const level = n.attrs?.level === 2 ? 2 : n.attrs?.level === 3 ? 3 : 1;
      const style = textAlignStyle(n);
      if (level === 1) return <h1 style={style}>{renderInline(children)}</h1>;
      if (level === 2) return <h2 style={style}>{renderInline(children)}</h2>;
      return <h3 style={style}>{renderInline(children)}</h3>;
    }
    case 'bulletList':
      return (
        <ul>
          {children.map((item, index) => (
            <li key={index}>{(item.content as AnyNode[] | undefined)?.map((child, i) => <BlockNode key={i} node={child} />)}</li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol start={n.attrs?.start ?? undefined}>
          {children.map((item, index) => (
            <li key={index}>{(item.content as AnyNode[] | undefined)?.map((child, i) => <BlockNode key={i} node={child} />)}</li>
          ))}
        </ol>
      );
    case 'blockquote':
      return <blockquote>{children.map((child, index) => <BlockNode key={index} node={child} />)}</blockquote>;
    case 'codeBlock':
      return (
        <pre>
          <code>{children.map((child) => child.text ?? '').join('')}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr />;
    default:
      return null;
  }
}

function renderInline(nodes: AnyNode[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === 'hardBreak') return <br key={index} />;
    if (node.type !== 'text' || typeof node.text !== 'string') return null;
    return (
      <span key={index}>
        {applyMarks(node.text, node.marks)}
      </span>
    );
  });
}

function applyMarks(text: string, marks: DocumentMark[] | undefined): ReactNode {
  if (!marks || marks.length === 0) return text;
  return marks.reduce<ReactNode>((content, mark) => wrapMark(content, mark), text);
}

function wrapMark(content: ReactNode, mark: DocumentMark): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong>{content}</strong>;
    case 'italic':
      return <em>{content}</em>;
    case 'underline':
      return <u>{content}</u>;
    case 'strike':
      return <s>{content}</s>;
    case 'code':
      return <code>{content}</code>;
    case 'link': {
      const href = mark.attrs.href;
      if (!isSafeHref(href)) return content;
      const external = /^https?:/i.test(href);
      return (
        <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>
          {content}
        </a>
      );
    }
    case 'textStyle': {
      const color = mark.attrs?.color;
      if (!color || !isSafeCssColor(color)) return content;
      return <span style={{ color }}>{content}</span>;
    }
    case 'highlight': {
      const color = mark.attrs?.color;
      return <mark style={color && isSafeCssColor(color) ? { backgroundColor: color } : undefined}>{content}</mark>;
    }
    default:
      return content;
  }
}
