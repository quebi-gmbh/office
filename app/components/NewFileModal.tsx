/**
 * "New file" modal — pick a document type, name it, and it's created in the
 * workspace and opened directly in the matching tool.
 */
import { useRef, useState } from "react";
import { Code2, FileText, FileType, Image as ImageIcon, Table } from "lucide-react";
import type { ToolId } from "../lib/workspace";
import { Button } from "./ui/Button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
} from "./ui/Dialog";

export interface NewFileType {
  id: string;
  label: string;
  hint: string;
  tool: ToolId;
  ext: string;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  /** Initial content for the new file. */
  make: () => string | Blob | Promise<Blob>;
}

async function blankPng(): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 768;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return new Promise<Blob>((resolve) =>
    c.toBlob((b) => resolve(b as Blob), "image/png"),
  );
}

export const NEW_FILE_TYPES: NewFileType[] = [
  { id: "doc", label: "Document", hint: "Markdown", tool: "docs", ext: "md", icon: FileText, make: () => "" },
  { id: "sheet", label: "Spreadsheet", hint: "CSV", tool: "table", ext: "csv", icon: Table, make: () => "" },
  { id: "code", label: "Code / text", hint: "Plain text", tool: "code", ext: "txt", icon: Code2, make: () => "" },
  { id: "typst", label: "Typst", hint: "Typesetting", tool: "typst", ext: "typ", icon: FileType, make: () => "" },
  { id: "image", label: "Drawing", hint: "Blank PNG", tool: "paint", ext: "png", icon: ImageIcon, make: blankPng },
];

export function NewFileModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (type: NewFileType, filename: string) => void | Promise<void>;
}) {
  const [type, setType] = useState<NewFileType>(NEW_FILE_TYPES[0]!);
  const [filename, setFilename] = useState(`untitled.${NEW_FILE_TYPES[0]!.ext}`);
  const lastDefault = useRef(filename);
  const [busy, setBusy] = useState(false);

  function chooseType(t: NewFileType) {
    setType(t);
    // Update the filename's default extension unless the user customized it.
    if (!filename || filename === lastDefault.current) {
      const next = `untitled.${t.ext}`;
      setFilename(next);
      lastDefault.current = next;
    }
  }

  async function submit() {
    const name = filename.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onCreate(type, name);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader title="New file" />
      <DialogBody>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {NEW_FILE_TYPES.map((t) => {
            const Icon = t.icon;
            const active = t.id === type.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => chooseType(t)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border hover:border-accent/40"
                }`}
              >
                <Icon size={16} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate">{t.label}</span>
                  <span className="block truncate text-xs text-muted">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <label className="mb-1 block text-xs text-muted">Filename</label>
        <input
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          autoFocus
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </DialogBody>
      <DialogFooter>
        <DialogClose>Cancel</DialogClose>
        <Button
          intent="primary"
          onClick={() => void submit()}
          disabled={!filename.trim() || busy}
        >
          {busy ? "Creating…" : "Create & open"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
