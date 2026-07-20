/**
 * Client-side Google config, read from build-time `VITE_GOOGLE_*` env vars.
 *
 * These values are PUBLIC (they ship in the bundle) and are secured by
 * authorized-origin / API-key restrictions, not secrecy. Importing this module
 * pulls in NO Google client code, so it's safe to reference eagerly (e.g. to
 * decide whether to show the "Google Drive" option in the sidebar).
 */
export const GOOGLE_CLIENT_ID: string | undefined =
  import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const GOOGLE_API_KEY: string | undefined =
  import.meta.env.VITE_GOOGLE_API_KEY;
export const GOOGLE_PROJECT_NUMBER: string | undefined =
  import.meta.env.VITE_GOOGLE_PROJECT_NUMBER;

/** Drive scope — folder-scoped, non-restricted (no CASA assessment needed). */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** True when all three public config values are present. */
export function driveConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_API_KEY && GOOGLE_PROJECT_NUMBER);
}
