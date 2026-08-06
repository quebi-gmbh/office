/**
 * Reusable signatures — captured once in the Draw panel, kept in
 * `localStorage`, stamped onto any page of any document.
 *
 * Nothing leaves the browser: the strokes are normalised point lists (see
 * {@link normalizeSignature}), a few KB of JSON at most.
 */
import type { InkPoint } from "~/pdf/lib/annotate";

const KEY = "quebi.pdf.signatures.v1";
const MAX_SIGNATURES = 12;

export type StoredSignature = {
  id: string;
  name: string;
  /** Strokes normalised to x ∈ [0,1], y ∈ [0,aspect]. */
  paths: InkPoint[][];
  /** height / width. */
  aspect: number;
  createdAt: number;
};

function isSignature(v: unknown): v is StoredSignature {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<StoredSignature>;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.aspect === "number" &&
    Array.isArray(s.paths) &&
    s.paths.every((p) => Array.isArray(p))
  );
}

export function loadSignatures(): StoredSignature[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSignature);
  } catch {
    return [];
  }
}

function persist(list: StoredSignature[]): StoredSignature[] {
  if (typeof localStorage === "undefined") return list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Quota / private mode — the signature still works for this session.
  }
  return list;
}

export function saveSignature(sig: Omit<StoredSignature, "id" | "createdAt">): StoredSignature[] {
  const entry: StoredSignature = {
    ...sig,
    id: Math.random().toString(36).slice(2, 10),
    createdAt: Date.now(),
  };
  return persist([entry, ...loadSignatures()].slice(0, MAX_SIGNATURES));
}

export function deleteSignature(id: string): StoredSignature[] {
  return persist(loadSignatures().filter((s) => s.id !== id));
}
