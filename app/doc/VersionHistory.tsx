/**
 * VersionHistory drawer — lists saved snapshots.
 *
 * Per entry: timestamp, title, Restore / Diff / Delete.
 * Diff preview is lazy-loaded (jsdiff package) and compares plain-text
 * extracts via generateText from @tiptap/core.
 */
import { useEffect, useState } from "react";
import { Drawer } from "~/components/Drawer";
import type { Editor } from "@tiptap/react";
import { generateText } from "@tiptap/core";
import type { DocVersion } from "./versioning";
import { loadVersions, deleteVersion } from "./versioning";
import { buildExtensions } from "./extensions";

interface Props {
  open: boolean;
  onClose: () => void;
  editor: Editor;
  title: string;
  setTitle: (t: string) => void;
  onRestored: () => void;
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function VersionHistory({
  open,
  onClose,
  editor,
  setTitle,
  onRestored,
}: Props) {
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [diffId, setDiffId] = useState<string | null>(null);
  const [diffLines, setDiffLines] = useState<string[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);

  function refresh() {
    setVersions(loadVersions());
    setDiffId(null);
    setDiffLines([]);
  }

  // Reload versions list whenever the drawer opens
  useEffect(() => {
    if (open) refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleDiff(v: DocVersion) {
    if (diffId === v.id) {
      setDiffId(null);
      setDiffLines([]);
      return;
    }
    setDiffLoading(true);
    setDiffId(v.id);
    try {
      const { createTwoFilesPatch } = await import("diff");
      const exts = buildExtensions(false);
      const current = generateText(editor.getJSON(), exts);
      const historical = generateText(v.doc, exts);
      const patch = createTwoFilesPatch(
        "current",
        v.title,
        current,
        historical,
        "",
        "",
      );
      setDiffLines(patch.split("\n"));
    } catch {
      setDiffLines(["Could not generate diff."]);
    } finally {
      setDiffLoading(false);
    }
  }

  function handleRestore(v: DocVersion) {
    if (
      !confirm(
        `Restore to "${v.title}" from ${formatDate(v.createdAt)}? Your current document will be replaced.`,
      )
    )
      return;
    editor.commands.setContent(v.doc);
    setTitle(v.title);
    onRestored();
    onClose();
  }

  function handleDelete(id: string) {
    deleteVersion(id);
    setVersions((vs) => vs.filter((v) => v.id !== id));
    if (diffId === id) {
      setDiffId(null);
      setDiffLines([]);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Version history">
      {versions.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">
          No saved versions yet. Use{" "}
          <strong className="text-fg">File → Save snapshot</strong> or enable
          auto-snapshots in settings.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {versions.map((v, i) => (
            <div key={v.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.title}</p>
                  <p className="text-xs text-muted">
                    {formatDate(v.createdAt)}
                    {i === 0 && (
                      <span className="ml-1.5 font-medium text-accent">
                        Latest
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void handleDiff(v)}
                    className="rounded px-2 py-0.5 text-xs text-muted hover:bg-border hover:text-fg"
                  >
                    {diffId === v.id ? "Hide" : "Diff"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRestore(v)}
                    className="rounded px-2 py-0.5 text-xs font-medium text-accent hover:bg-border"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(v.id)}
                    className="rounded px-2 py-0.5 text-xs text-muted hover:bg-border hover:text-fg"
                    aria-label="Delete version"
                  >
                    ×
                  </button>
                </div>
              </div>

              {diffId === v.id && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border bg-card p-2 font-mono text-[11px]">
                  {diffLoading ? (
                    <span className="text-muted">Loading diff…</span>
                  ) : (
                    diffLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={
                          line.startsWith("+") && !line.startsWith("+++")
                            ? "text-green-500"
                            : line.startsWith("-") && !line.startsWith("---")
                              ? "text-red-500"
                              : "text-muted"
                        }
                      >
                        {line || " "}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
