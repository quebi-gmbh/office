/**
 * Minimal button primitive with intents, styled with the app's theme tokens.
 * Mirrors the intent-based API of the quebi ui-lib without pulling in
 * react-aria-components.
 */
import type { ButtonHTMLAttributes } from "react";

export type ButtonIntent = "primary" | "ghost" | "danger" | "default";

const INTENTS: Record<ButtonIntent, string> = {
  primary: "bg-accent text-white hover:opacity-90",
  ghost: "text-muted hover:bg-bg hover:text-fg",
  danger: "bg-red-600 text-white hover:bg-red-700",
  default: "border border-border hover:border-accent/40",
};

export function Button({
  intent = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { intent?: ButtonIntent }) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${INTENTS[intent]} ${className}`}
      {...props}
    />
  );
}
