/**
 * Cross-tool handoff to /code via sessionStorage. Kept dependency-free so the
 * /code chunk doesn't pull in any other tool's code.
 */
const KEY = "office:code:incoming";

export interface CodeHandoff {
  text: string;
  langId: string;
}

export function setCodeHandoff(h: CodeHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    /* ignore */
  }
}

/** Read + clear a pending handoff (called once on /code mount). */
export function takeCodeHandoff(): CodeHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as CodeHandoff;
  } catch {
    return null;
  }
}
