/**
 * A labelled row for a settings control.
 * Renders a label on the left and any form control on the right.
 */
import type { FC, PropsWithChildren } from "react";

type SettingsRowProps = {
  label: string;
  /** Optional extra description shown below the label. */
  description?: string;
  htmlFor?: string;
};

export const SettingsRow: FC<PropsWithChildren<SettingsRowProps>> = ({
  label,
  description,
  htmlFor,
  children,
}) => (
  <div className="flex items-start justify-between gap-4 py-2.5">
    <div className="min-w-0 flex-1">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium leading-snug"
      >
        {label}
      </label>
      {description && (
        <p className="mt-0.5 text-xs text-muted leading-snug">{description}</p>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/** Divider with a section heading. */
export const SettingsSection: FC<PropsWithChildren<{ title: string }>> = ({
  title,
  children,
}) => (
  <div className="mt-6 first:mt-0">
    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
      {title}
    </h3>
    <div className="divide-y divide-border rounded-lg border border-border bg-card px-4">
      {children}
    </div>
  </div>
);
