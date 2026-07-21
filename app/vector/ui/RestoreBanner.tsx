/** Prompt shown on load when a previous autosaved session is available. */
export function RestoreBanner({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-accent/10 px-4 py-2 text-sm">
      <span className="text-fg">A previous drawing was found.</span>
      <button type="button" onClick={onRestore} className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-black hover:opacity-90">
        Restore
      </button>
      <button type="button" onClick={onDiscard} className="rounded border border-border px-2.5 py-1 text-xs text-muted hover:text-fg">
        Discard
      </button>
    </div>
  );
}
