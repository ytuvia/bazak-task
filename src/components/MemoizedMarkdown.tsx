'use client';
import { marked } from 'marked';
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map(token => token.raw);
}

const MemoizedMarkdownBlock = memo(
  ({ content }: { content: string }) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-snug">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-slate-50">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-');
          return isBlock ? (
            <code className="block rounded bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200 mb-2 overflow-x-auto whitespace-pre">
              {children}
            </code>
          ) : (
            <code className="rounded bg-slate-900 px-1 py-0.5 font-mono text-xs text-slate-200">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <pre className="mb-2">{children}</pre>,
        h1: ({ children }) => <h1 className="mb-1 text-base font-bold text-slate-50">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-1 text-sm font-bold text-slate-50">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold text-slate-100">{children}</h3>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-slate-500 pl-3 text-slate-300 italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-2 border-slate-600" />,
      }}
    >
      {content}
    </ReactMarkdown>
  ),
  (prevProps, nextProps) => prevProps.content === nextProps.content,
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

export const MemoizedMarkdown = memo(
  ({ content, id }: { content: string; id: string }) => {
    // During streaming (id === "streaming") skip block-splitting to avoid O(n²) re-parsing.
    // Block memoization only pays off for stable, completed messages.
    if (id === 'streaming') {
      return <MemoizedMarkdownBlock content={content} />;
    }
    const blocks = parseMarkdownIntoBlocks(content);
    return (
      <>
        {blocks.map((block, index) => (
          <MemoizedMarkdownBlock content={block} key={`${id}-block_${index}`} />
        ))}
      </>
    );
  },
);

MemoizedMarkdown.displayName = 'MemoizedMarkdown';
