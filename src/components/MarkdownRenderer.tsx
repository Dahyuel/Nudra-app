import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  return (
    <div className={`markdown-body ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // ---- Headings ----
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-4 mb-2 text-[#1B1B1B]">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-4 mb-2 text-[#1B1B1B]">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold mt-3 mb-1.5 text-[#1B1B1B]">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold mt-3 mb-1.5 text-[#1B1B1B]">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-xs font-semibold mt-2 mb-1 text-[#1B1B1B]">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-xs font-semibold mt-2 mb-1 text-[#1B1B1B]">{children}</h6>
          ),

          // ---- Paragraphs ----
          p: ({ children }) => <p className="leading-relaxed my-1.5">{children}</p>,

          // ---- Links ----
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2D6A4F] underline underline-offset-2 hover:text-[#23533e]"
            >
              {children}
            </a>
          ),

          // ---- Inline code ----
          code: ({ inline, className: codeClassName, children, ...props }: any) => {
            const isInline = inline ?? !String(codeClassName ?? '').includes('language-');
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded-md bg-[#2D6A4F]/10 text-[#2D6A4F] font-mono text-[0.85em]">
                  {children}
                </code>
              );
            }
            return (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            );
          },

          // ---- Code blocks ----
          pre: ({ children }) => {
            // Try to read language from the child code element's className
            let lang = '';
            const child: any = Array.isArray(children) ? children[0] : children;
            if (child?.props?.className) {
              const match = /language-(\w+)/.exec(child.props.className);
              if (match) lang = match[1];
            }
            return (
              <div className="my-3 rounded-xl overflow-hidden border border-gray-200">
                {lang && (
                  <div className="px-3 py-1.5 bg-[#1B1B1B] text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    {lang}
                  </div>
                )}
                <pre className="p-3 bg-[#1B1B1B] text-emerald-100 text-[12px] leading-relaxed overflow-x-auto font-mono">
                  {children}
                </pre>
              </div>
            );
          },

          // ---- Lists ----
          ul: ({ children }) => <ul className="my-2 space-y-1.5 pl-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 space-y-1.5 pl-1">{children}</ol>,
          li: ({ children, ...props }: any) => {
            // GFM task list items come with a checkbox input as first child
            const isTask = props?.className?.includes?.('task-list-item');
            return (
              <li className={`flex gap-2 leading-relaxed ${isTask ? 'items-start' : ''}`}>
                <span className="text-[#2D6A4F] shrink-0 mt-0.5">•</span>
                <span className="flex-1 min-w-0">{children}</span>
              </li>
            );
          },

          // ---- Blockquote ----
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-4 border-[#B7E4C7] pl-3 py-1 text-[#4B5563] italic">
              {children}
            </blockquote>
          ),

          // ---- Horizontal rule ----
          hr: () => <hr className="my-4 border-gray-200" />,

          // ---- Tables (GFM) ----
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#F8FAF9]">{children}</thead>,
          th: ({ children }) => (
            <th className="text-left font-bold text-[#1B1B1B] px-3 py-2 border-b border-gray-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-gray-100 align-top">{children}</td>
          ),

          // ---- Bold / Italic / Strikethrough ----
          strong: ({ children }) => (
            <strong className="font-bold text-[#1B1B1B]">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="line-through opacity-70">{children}</del>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;