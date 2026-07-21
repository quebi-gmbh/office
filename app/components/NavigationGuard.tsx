/**
 * Intercepts in-app navigations (and tab close) while the active editor has
 * unsaved changes, showing a Save / Discard / Cancel prompt. Mounted once in the
 * root layout, inside <ClientOnly> (useBlocker is client-only).
 */
import { useEffect } from "react";
import { useBlocker } from "react-router";
import { isCurrentlyDirty, saveCurrent, useGuardState } from "~/lib/workspace";
import { UnsavedChangesModal } from "./UnsavedChangesModal";

export function NavigationGuard() {
  const g = useGuardState();

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      g.active &&
      g.dirty &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  // Native prompt for full page unload / refresh / close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isCurrentlyDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <UnsavedChangesModal
      open={blocker.state === "blocked"}
      name={g.name || "this document"}
      onSave={async () => {
        const ok = await saveCurrent();
        if (ok) blocker.proceed?.();
        else blocker.reset?.();
      }}
      onDiscard={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  );
}
