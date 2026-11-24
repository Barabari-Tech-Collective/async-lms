/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Checks if a string appears to be markdown that was accidentally wrapped
 * in HTML paragraph tags (e.g. by TipTap/RichTextEditor).
 */
export function isCorruptedMarkdown(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();

  // Explicit check for <p> followed by markdown headers
  if (/^<p[\s>].*?#{1,6}\s+/is.test(trimmed)) return true;

  // Generic check: wrapped in <p>...</p> but contains markdown markers inside
  if (/^<p[\s>]/.test(trimmed) && /<\/p>$/i.test(trimmed)) {
    const inner = trimmed.replace(/^<p\b[^>]*>/i, '').replace(/<\/p>$/i, '');
    const hasMarkdownSyntax =
      /(?:^|\s)#{1,6}\s+/.test(inner) ||
      /(?:^|\s)---\s+/.test(inner) ||
      /\*\*[^*]+\*\*/.test(inner) ||
      /(?:^|\s)(?:-|\*|\d+\.)\s+/.test(inner);

    if (hasMarkdownSyntax) {
      return true;
    }
  }

  return false;
}

/**
 * Unwraps corrupted markdown from <p>...</p>, restores newlines that were collapsed
 * by rich text editors, and unescapes HTML entities.
 */
export function cleanCorruptedMarkdown(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.trim();

  // Strip outer <p> and </p> tags
  cleaned = cleaned.replace(/^<p\b[^>]*>/i, '').replace(/<\/p>$/i, '');

  // Unescape standard HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Convert internal </p><p> paragraph boundaries to markdown double newlines
  cleaned = cleaned.replace(/<\/p>\s*<p\b[^>]*>/gi, '\n\n');

  // Restore newlines before markdown headings that got collapsed into single spaces
  // Example: "...formulas. ### Worksheet Setup" -> "...formulas.\n\n### Worksheet Setup"
  cleaned = cleaned.replace(/([^\n])\s+(#{1,6}\s+)/g, '$1\n\n$2');

  // Restore newlines around horizontal rules (---)
  cleaned = cleaned.replace(/([^\n])\s+(---\s+)/g, '$1\n\n$2\n\n');

  // Restore newlines before list items that got collapsed
  cleaned = cleaned.replace(/([^\n])\s+(-\s+)/g, '$1\n$2');
  cleaned = cleaned.replace(/([^\n])\s+(\d+\.\s+)/g, '$1\n$2');
  cleaned = cleaned.replace(/([^\n])\s+(\*\s+)/g, '$1\n$2');

  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Checks if the content is true HTML formatted content.
 */
export function isHtmlContent(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();

  if (isCorruptedMarkdown(trimmed)) return false;

  // Check for distinct Markdown syntax markers anywhere in the document
  const hasMarkdownSyntax =
    /(?:^|\n)\s*#{1,6}\s+/.test(trimmed) ||           // Headings: # H1, ## H2
    /(?:^|\n)\s*```/.test(trimmed) ||                 // Code fences: ```lang
    /(?:^|\n)\s*---\s*(?:\n|$)/.test(trimmed) ||      // Horizontal rule: ---
    /(?:^|\n)\s*(?:-|\*|\d+\.)\s+/.test(trimmed) ||   // Lists: - item, * item, 1. item
    /(?:^|\n)\s*>\s+/.test(trimmed);                  // Blockquotes: > quote

  // If it has Markdown structural markers, it is Markdown (even if it contains embedded HTML tags)
  if (hasMarkdownSyntax) {
    return false;
  }

  // Check if it starts with an HTML tag (WYSIWYG / TipTap output always starts with a tag like <p>, <div>, <h1>, etc.)
  const startsWithHtmlTag = /^<(!doctype|[a-z][a-z0-9]*)\b[^>]*>/i.test(trimmed);

  // Has structural HTML tags like headings, lists, tables, pre, blockquote
  const hasStructuralHtml = /<(h[1-6]|ul|ol|li|table|pre|blockquote)\b/i.test(trimmed);
  if (hasStructuralHtml) return true;

  // Has paragraph or formatting tags
  const hasBasicHtml = /<(p|strong|em|b|i|u|span|div)\b/i.test(trimmed);
  return startsWithHtmlTag && hasBasicHtml;
}

/**
 * Automatically decides whether to open an editor in 'rich' or 'markdown' mode.
 */
export function detectEditorType(content?: string | null): 'rich' | 'markdown' {
  if (!content || !content.trim()) return 'markdown';
  if (isCorruptedMarkdown(content)) return 'markdown';
  if (isHtmlContent(content)) return 'rich';
  return 'markdown';
}

/**
 * Converts Markdown string to clean HTML (for TipTap / RichTextEditor).
 */
export function markdownToHtml(md?: string | null): string {
  if (!md || !md.trim()) return '';
  const cleanMd = isCorruptedMarkdown(md) ? cleanCorruptedMarkdown(md) : md;
  try {
    const html = marked.parse(cleanMd, { async: false, gfm: true, breaks: true }) as string;
    return html.trim();
  } catch (err) {
    console.error('Failed to parse markdown to html:', err);
    return cleanMd;
  }
}

/**
 * Converts HTML string to clean Markdown (for MarkdownEditor).
 */
export function htmlToMarkdown(html?: string | null): string {
  if (!html || !html.trim()) return '';

  if (isCorruptedMarkdown(html)) {
    return cleanCorruptedMarkdown(html);
  }

  if (typeof DOMParser === 'undefined') return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    function nodeToMd(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const childrenMd = Array.from(el.childNodes).map(nodeToMd).join('');

      switch (tag) {
        case 'h1':
          return `# ${childrenMd.trim()}\n\n`;
        case 'h2':
          return `## ${childrenMd.trim()}\n\n`;
        case 'h3':
          return `### ${childrenMd.trim()}\n\n`;
        case 'h4':
          return `#### ${childrenMd.trim()}\n\n`;
        case 'h5':
          return `##### ${childrenMd.trim()}\n\n`;
        case 'h6':
          return `###### ${childrenMd.trim()}\n\n`;
        case 'p':
          return `${childrenMd.trim()}\n\n`;
        case 'br':
          return '\n';
        case 'hr':
          return '---\n\n';
        case 'strong':
        case 'b':
          return `**${childrenMd}**`;
        case 'em':
        case 'i':
          return `*${childrenMd}*`;
        case 's':
        case 'del':
        case 'strike':
          return `~~${childrenMd}~~`;
        case 'code':
          return el.parentElement?.tagName.toLowerCase() === 'pre'
            ? childrenMd
            : `\`${childrenMd}\``;
        case 'pre':
          return `\`\`\`\n${childrenMd.trim()}\n\`\`\`\n\n`;
        case 'blockquote':
          return (
            childrenMd
              .trim()
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n') + '\n\n'
          );
        case 'ul': {
          const items = Array.from(el.children)
            .map((li) => `- ${li.textContent?.trim() || ''}`)
            .join('\n');
          return `${items}\n\n`;
        }
        case 'ol': {
          const items = Array.from(el.children)
            .map((li, idx) => `${idx + 1}. ${li.textContent?.trim() || ''}`)
            .join('\n');
          return `${items}\n\n`;
        }
        case 'li':
          return `${childrenMd.trim()}\n`;
        case 'a': {
          const href = el.getAttribute('href') || '';
          return `[${childrenMd}](${href})`;
        }
        case 'img': {
          const src = el.getAttribute('src') || '';
          const alt = el.getAttribute('alt') || 'image';
          return `![${alt}](${src})\n\n`;
        }
        default:
          return childrenMd;
      }
    }

    const result = Array.from(doc.body.childNodes)
      .map(nodeToMd)
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return result;
  } catch (err) {
    console.error('Failed to convert HTML to markdown:', err);
    return html;
  }
}

/**
 * Universal content renderer that safely and accurately renders
 * Markdown, HTML, and corrupted Markdown.
 */
export const FormattedContent: React.FC<{
  content?: string | null;
  className?: string;
  fallback?: React.ReactNode;
}> = ({ content, className = '', fallback = null }) => {
  if (!content || !content.trim()) {
    return <>{fallback}</>;
  }

  // Corrupted markdown: clean and render as Markdown
  if (isCorruptedMarkdown(content)) {
    const cleaned = cleanCorruptedMarkdown(content);
    return (
      <div className={className}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleaned}</ReactMarkdown>
      </div>
    );
  }

  // True HTML (Sanitized against stored XSS)
  if (isHtmlContent(content)) {
    const cleanHtml = DOMPurify.sanitize(content, {
      ADD_ATTR: ['target'],
    });
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    );
  }

  // Standard Markdown
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
};
