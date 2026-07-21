/** Modal dialogs and the autosave restore banner for the CAD tool. */
import { useEffect, useState } from "react";
import { Check, Copy, RotateCcw, Trash2, X } from "lucide-react";
import { useCad } from "../hooks/useCad";
import {
  deleteNamedDoc,
  listSavedDocs,
  type SavedDocEntry,
} from "../io/autosave";
import { downloadBlob, meshToGlbBlob, meshToStlBlob, dataUrlToBlob } from "../io/export";
import { encodeShare } from "../lib/serialize";
import type { CadDoc } from "../lib/types";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:text-fg">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function RestoreBanner({ name, onRestore, onDiscard }: { name: string; onRestore: () => void; onDiscard: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <RotateCcw size={15} aria-hidden className="text-amber-400" />
      <span>
        Restore your last session{name ? ` — “${name}”` : ""}?
      </span>
      <button type="button" onClick={onRestore} className="rounded border border-amber-500/50 px-2 py-0.5 text-xs hover:bg-amber-500/20">
        Restore
      </button>
      <button type="button" onClick={onDiscard} className="text-xs text-muted hover:text-fg">
        Dismiss
      </button>
    </div>
  );
}

export function NewDocDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState("Untitled");
  return (
    <Modal title="New document" onClose={onClose}>
      <label className="block text-sm text-muted">Name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onConfirm(name.trim() || "Untitled")}
        className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
      />
      <p className="mt-2 text-xs text-muted">This clears the current model. Save first if you want to keep it.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(name.trim() || "Untitled")}
          className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-sm text-accent"
        >
          Create
        </button>
      </div>
    </Modal>
  );
}

export function SaveDialog({ initialName, onClose, onConfirm }: { initialName: string; onClose: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  return (
    <Modal title="Save document" onClose={onClose}>
      <label className="block text-sm text-muted">Document name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onConfirm(name.trim())}
        className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent">
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onConfirm(name.trim())}
          className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-sm text-accent disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

export function OpenDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (name: string) => void }) {
  const [docs, setDocs] = useState<SavedDocEntry[]>([]);
  useEffect(() => setDocs(listSavedDocs()), []);
  return (
    <Modal title="Open document" onClose={onClose}>
      {docs.length === 0 ? (
        <p className="text-sm text-muted">No saved documents yet. Use Save to store one.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-border overflow-auto">
          {docs.map((d) => (
            <li key={d.name} className="flex items-center gap-2 py-2">
              <button type="button" onClick={() => onOpen(d.name)} className="flex-1 text-left text-sm hover:text-accent">
                <span className="font-medium">{d.name}</span>
                <span className="block text-xs text-muted">{new Date(d.savedAt).toLocaleString()}</span>
              </button>
              <button
                type="button"
                title="Delete"
                onClick={() => {
                  deleteNamedDoc(d.name);
                  setDocs(listSavedDocs());
                }}
                className="rounded p-1 text-muted hover:text-red-400"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function ShareDialog({ doc, onClose }: { doc: CadDoc; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}#doc=${encodeShare(doc)}`
      : "";
  return (
    <Modal title="Share by link" onClose={onClose}>
      <p className="text-sm text-muted">Anyone with this link opens a copy of the current model. Everything stays client-side.</p>
      <div className="mt-3 flex gap-2">
        <input readOnly value={url} className="min-w-0 flex-1 rounded border border-border bg-bg px-3 py-2 text-xs" />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1.5 rounded-md border border-accent bg-accent/10 px-3 py-2 text-sm text-accent"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </Modal>
  );
}

export function ExportDialog({ onClose, snapshot }: { onClose: () => void; snapshot: () => string }) {
  const result = useCad((s) => s.evalResult);
  const name = useCad((s) => s.doc.name);
  const [busy, setBusy] = useState<string | null>(null);
  const safe = name.replace(/[^\w.-]+/g, "_") || "model";
  const hasMesh = !!result && result.triangles > 0;

  async function exportStl() {
    if (!result) return;
    downloadBlob(meshToStlBlob(result.mesh), `${safe}.stl`);
  }
  async function exportGlb() {
    if (!result) return;
    setBusy("glb");
    try {
      const blob = await meshToGlbBlob(result.mesh);
      downloadBlob(blob, `${safe}.glb`);
    } finally {
      setBusy(null);
    }
  }
  function exportPng() {
    downloadBlob(dataUrlToBlob(snapshot()), `${safe}.png`);
  }

  const row = "flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm";
  const btn = "rounded-md border border-accent bg-accent/10 px-3 py-1 text-sm text-accent disabled:opacity-40";

  return (
    <Modal title="Export" onClose={onClose}>
      {!hasMesh && <p className="mb-3 text-xs text-amber-400">The model is empty — add a solid feature first.</p>}
      <div className="flex flex-col gap-2">
        <div className={row}>
          <span>STL — watertight mesh for 3-D printing</span>
          <button type="button" className={btn} disabled={!hasMesh} onClick={() => void exportStl()}>
            Download
          </button>
        </div>
        <div className={row}>
          <span>GLB — glTF binary for 3-D viewers</span>
          <button type="button" className={btn} disabled={!hasMesh || busy === "glb"} onClick={() => void exportGlb()}>
            {busy === "glb" ? "…" : "Download"}
          </button>
        </div>
        <div className={row}>
          <span>PNG — viewport snapshot</span>
          <button type="button" className={btn} onClick={exportPng}>
            Download
          </button>
        </div>
      </div>
    </Modal>
  );
}
