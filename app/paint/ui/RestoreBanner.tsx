/**
 * Session restore banner — shown on mount if an autosave was found.
 * "Restore" loads the saved canvas; "Discard" rotates the session ID.
 */
interface RestoreBannerProps {
  onRestore(): void;
  onDiscard(): void;
}

export function RestoreBanner({ onRestore, onDiscard }: RestoreBannerProps) {
  return (
    <div className="paint-restore-banner" role="alert">
      <span>You have an unsaved session from last time.</span>
      <div className="paint-restore-banner__actions">
        <button type="button" className="paint-toolbar__btn" onClick={onRestore}>
          ↩ Restore
        </button>
        <button type="button" className="paint-toolbar__btn" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
