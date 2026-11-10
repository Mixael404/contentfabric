/**
 * Intermediate representation of post content.
 * The model writes a restricted Markdown dialect; we parse it once and
 * render it to each messenger's markup separately.
 */

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'strike'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'quote'; lines: Inline[][] }
  | { type: 'list'; items: Inline[][] };

interface Pattern {
  re: RegExp;
  build: (m: RegExpExecArray) => Inline;
}

const PATTERNS: Pattern[] = [
  {
    re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/,
    build: (m) => ({ type: 'link', href: m[2], children: parseInline(m[1]) }),
  },
  { re: /`([^`\n]+)`/, build: (m) => ({ type: 'code', value: m[1] }) },
  { re: /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/, build: (m) => ({ type: 'bold', children: parseInline(m[1]) }) },
  { re: /__(?=\S)([\s\S]+?)(?<=\S)__/, build: (m) => ({ type: 'bold', children: parseInline(m[1]) }) },
  { re: /~~(?=\S)([\s\S]+?)(?<=\S)~~/, build: (m) => ({ type: 'strike', children: parseInline(m[1]) }) },
  {
    re: /(?<![\p{L}\p{N}*])\*(?=[^\s*])([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}*])/u,
    build: (m) => ({ type: 'italic', children: parseInline(m[1]) }),
  },
  {
    re: /(?<![\p{L}\p{N}_])_(?=[^\s_])([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}_])/u,
    build: (m) => ({ type: 'italic', children: parseInline(m[1]) }),
  },
];

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest.length > 0) {
    let best: { idx: number; m: RegExpExecArray; p: Pattern } | null = null;
    for (const p of PATTERNS) {
      const m = p.re.exec(rest);
      if (m && (best === null || m.index < best.idx)) best = { idx: m.index, m, p };
    }
    if (!best) {
      out.push({ type: 'text', value: rest });
      break;
    }
    if (best.idx > 0) out.push({ type: 'text', value: rest.slice(0, best.idx) });
    out.push(best.p.build(best.m));
    rest = rest.slice(best.idx + best.m[0].length);
  }
  return mergeText(out);
}

function mergeText(nodes: Inline[]): Inline[] {
  const res: Inline[] = [];
  for (const n of nodes) {
    const prev = res[res.length - 1];
    if (n.type === 'text' && prev && prev.type === 'text') prev.value += n.value;
    else res.push(n);
  }
  return res;
}

const LIST_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const HEADING_RE = /^\s*#{1,6}\s+(.*)$/;

export function parseBlocks(markdown: string): Block[] {
  const normalized = markdown.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!normalized) return [];
  const chunks = normalized.split(/\n{2,}/);
  const blocks: Block[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;
    if (lines.every((l) => QUOTE_RE.test(l))) {
      blocks.push({ type: 'quote', lines: lines.map((l) => parseInline(l.match(QUOTE_RE)![1])) });
      continue;
    }
    if (lines.every((l) => LIST_RE.test(l))) {
      blocks.push({ type: 'list', items: lines.map((l) => parseInline(l.match(LIST_RE)![1])) });
      continue;
    }
    // Mixed chunk: split into runs of list / quote / plain lines.
    let current: Block | null = null;
    for (const line of lines) {
      const list = line.match(LIST_RE);
      const quote = line.match(QUOTE_RE);
      const heading = line.match(HEADING_RE);
      if (list) {
        if (current?.type !== 'list') {
          current = { type: 'list', items: [] };
          blocks.push(current);
        }
        current.items.push(parseInline(list[1]));
      } else if (quote) {
        if (current?.type !== 'quote') {
          current = { type: 'quote', lines: [] };
          blocks.push(current);
        }
        current.lines.push(parseInline(quote[1]));
      } else {
        if (current?.type !== 'paragraph') {
          current = { type: 'paragraph', lines: [] };
          blocks.push(current);
        }
        // Headings are not supported by messengers: render them as bold lines.
        current.lines.push(heading ? [{ type: 'bold', children: parseInline(heading[1]) }] : parseInline(line));
      }
    }
  }
  return blocks;
}

/** Replaces link nodes with their visible text (campaigns that publish without links). */
export function stripLinks(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
      case 'code':
        out.push(n);
        break;
      case 'link':
        out.push(...stripLinks(n.children));
        break;
      default:
        out.push({ type: n.type, children: stripLinks(n.children) });
    }
  }
  return mergeText(out);
}

export function stripBlockLinks(blocks: Block[]): Block[] {
  return blocks.map((b) => (b.type === 'list' ? { ...b, items: b.items.map(stripLinks) } : { ...b, lines: b.lines.map(stripLinks) }));
}

export function inlineToPlain(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
        case 'code':
          return n.value;
        default:
          return inlineToPlain(n.children);
      }
    })
    .join('');
}
