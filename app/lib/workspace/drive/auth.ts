/**
 * Google OAuth via Google Identity Services (GIS) token flow — fully client-side,
 * no client secret. Tokens are held in memory (~1h) with silent re-auth.
 */
import { DRIVE_SCOPE, GOOGLE_CLIENT_ID } from "./config";
import { loadScript } from "./load-scripts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GIS_SRC = "https://accounts.google.com/gsi/client";

let tokenClient: any = null;
let accessToken: string | null = null;
let expiresAt = 0;

async function ensureTokenClient(): Promise<any> {
  if (tokenClient) return tokenClient;
  await loadScript(GIS_SRC);
  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error("Google Identity Services failed to load");
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {}, // replaced per request below
  });
  return tokenClient;
}

/**
 * Return a valid access token, requesting/refreshing as needed. `interactive`
 * controls whether Google may show account/consent UI (needs a user gesture);
 * pass false for a silent refresh attempt.
 */
export async function getAccessToken(interactive = true): Promise<string> {
  if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;
  const client = await ensureTokenClient();
  return new Promise<string>((resolve, reject) => {
    client.callback = (resp: any) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      accessToken = resp.access_token;
      expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
      resolve(accessToken as string);
    };
    try {
      client.requestAccessToken({ prompt: interactive ? "" : "none" });
    } catch (e) {
      reject(e);
    }
  });
}

/** Drop the cached token (e.g. on sign-out / close workspace). */
export function clearToken(): void {
  accessToken = null;
  expiresAt = 0;
}
