/**
 * Version-history modal: snapshot on demand, restore, or delete past snapshots.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { type Snapshot, listSnapshots, deleteSnapshot } from "~/table/io/versioning";

interface HistoryModalProps {
  onClose: () => void;
  onSnapshot: () => void;
  onRestore: (snap: Snapshot) => void;
}

export function HistoryModal({ onClose, onSnapshot, onRestore }: HistoryModalProps) {
  const [snaps, setSnaps] = useState<Snapshot[]>(() => listSnapshots());
  const refresh = () => setSnaps(listSnapshots());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-border bg-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Version history</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-border hover:text-fg"><X size={14} /></button>
        </header>
        <div className="border-b border-border px-4 py-2">
          <button type="button" onClick={() => { onSnapshot(); refresh(); }} className="rounded border border-accent bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30">
            Save snapshot now
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
          {snaps.length === 0 && <li className="p-3 text-center text-muted">No snapshots yet. They're also saved automatically every 25 edits.</li>}
          {snaps.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-border">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.name}</div>
                <div className="text-muted">{new Date(s.savedAt).toLocaleString()} · {s.rows.toLocaleString()} rows · {s.sheets} sheet{s.sheets === 1 ? "" : "s"}</div>
              </div>
              <div className="ml-2 flex shrink-0 gap-1">
                <button type="button" onClick={() => onRestore(s)} className="rounded border border-border bg-card px-2 py-0.5 hover:border-accent">Restore</button>
                <button type="button" onClick={() => { deleteSnapshot(s.id); refresh(); }} className="rounded p-1 text-muted hover:text-red-600"><X size={12} /></button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
