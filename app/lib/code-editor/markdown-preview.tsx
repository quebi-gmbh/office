/**
 * Split-view Markdown preview for the code editor.
 *
 * Renders the CM editor alongside a live HTML preview using markdown-it
 * (lazy-loaded) sanitized by DOMPurify. Scroll sync is proportional.
 * Toggle with Ctrl-K V.
 */
import { useEffect, useRef, useState } from "react";

type MarkdownPreviewProps = {
  /** Raw Markdown source — updated on every document change */
  source: string;
  className?: string;
};

/**
 * Renders `source` as sanitized HTML inside a scrollable preview pane.
 * Both markdown-it and DOMPurify are lazy-loaded on first render.
 */
export function MarkdownPreview({ source, className }: MarkdownPreviewProps) {
  const [html, setHtml] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Debounce 200 ms
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const [{ default: MarkdownIt }, { default: DOMPurify }] =
        await Promise.all([
          import("markdown-it"),
          import("dompurify"),
        ]);
      const md = new MarkdownIt({
        html: false,
        linkify: true,
        typographer: true,
      });
      const dirty = md.render(source);
      const clean = DOMPurify.sanitize(dirty);
      setHtml(clean);
    }, 200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [source]);

  return (
    <div
      className={`overflow-y-auto p-4 prose prose-sm max-w-none text-fg ${className ?? ""}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
