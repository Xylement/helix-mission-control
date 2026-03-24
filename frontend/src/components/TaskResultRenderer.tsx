'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface TaskResultRendererProps {
  content: string;
  className?: string;
}

export function TaskResultRenderer({ content, className = '' }: TaskResultRendererProps) {
  if (!content) return null;

  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-4 mb-2 text-foreground">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold mt-3 mb-2 text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-2 mb-1 text-foreground">{children}</h3>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-muted p-3 rounded-md overflow-x-auto my-2">
                <code className={`text-sm font-mono ${className || ''}`} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="text-primary underline hover:text-primary/80">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 my-2 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse border border-border">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted px-3 py-1.5 text-left text-sm font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-1.5 text-sm">{children}</td>
          ),
          p: ({ children }) => (
            <p className="my-1.5 leading-relaxed">{children}</p>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
