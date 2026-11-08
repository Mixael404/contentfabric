import type { Block, Inline } from './ir.js';
import { inlineToPlain } from './ir.js';

export type Target = 'telegram' | 'max' | 'plain';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderInline(nodes: Inline[], target: Target): string {
  if (target === 'plain') return inlineToPlain(nodes);
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return escapeHtml(n.value);
        case 'code':
          return `<code>${escapeHtml(n.value)}</code>`;
        case 'bold':
          return `<b>${renderInline(n.children, target)}</b>`;
        case 'italic':
          return `<i>${renderInline(n.children, target)}</i>`;
        case 'strike':
          return `<s>${renderInline(n.children, target)}</s>`;
        case 'link':
          return `<a href="${escapeHtml(n.href)}">${renderInline(n.children, target)}</a>`;
      }
    })
    .join('');
}

export function renderBlock(block: Block, target: Target): string {
  switch (block.type) {
    case 'paragraph':
      return block.lines.map((l) => renderInline(l, target)).join('\n');
    case 'list':
      return block.items.map((l) => `• ${renderInline(l, target)}`).join('\n');
    case 'quote': {
      const inner = block.lines.map((l) => renderInline(l, target)).join('\n');
      if (target === 'plain') return inner;
      if (target === 'telegram') {
        const expandable = inner.length > 400 ? ' expandable' : '';
        return `<blockquote${expandable}>${inner}</blockquote>`;
      }
      return `<blockquote>${inner}</blockquote>`;
    }
  }
}

export function renderBlocks(blocks: Block[], target: Target): string {
  return blocks.map((b) => renderBlock(b, target)).join('\n\n');
}

/** Visible character count as the messenger counts it (after markup is parsed). */
export function visibleLength(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8203;/g, '​');
  // Telegram and Max count UTF-16 code units.
  return text.length;
}
