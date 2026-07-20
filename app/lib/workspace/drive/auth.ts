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

function hasDriveScope(resp: any): boolean {
  return String(resp?.scope || "")
    .split(" ")
    .includes(DRIVE_SCOPE);
}

/**
 * Return a valid access token, requesting/refreshing as needed. `interactive`
 * controls whether Google may show account/consent UI (needs a user gesture);
 * pass false for a silent refresh attempt.
 *
 * If Google issues a token that lacks the Drive scope (e.g. the user previously
 * authorized this app before the scope was configured), we force a `consent`
 * prompt once so the new scope is actually granted — otherwise every Drive REST
 * call would 403.
 */
export async function getAccessToken(interactive = true): Promise<string> {
  if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;
  const client = await ensureTokenClient();

  const request = (prompt: string): Promise<any> =>
    new Promise((resolve) => {
      client.callback = resolve;
      client.requestAccessToken({ prompt });
    });

  let resp = await request(interactive ? "" : "none");
  if (resp.error) {
    throw new Error(resp.error_description || resp.error);
  }
  // Re-consent once if the Drive scope wasn't granted.
  if (!hasDriveScope(resp) && interactive) {
    resp = await request("consent");
    if (resp.error) throw new Error(resp.error_description || resp.error);
  }
  if (!hasDriveScope(resp)) {
    throw new Error(
      `Google did not grant the "${DRIVE_SCOPE}" scope. Add it under the ` +
        `OAuth consent screen (APIs & Services → OAuth consent screen → ` +
        `Data access) and re-authorize.`,
    );
  }

  accessToken = resp.access_token;
  expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
  return accessToken as string;
}

/** Drop the cached token (e.g. on sign-out / close workspace). */
export function clearToken(): void {
  accessToken = null;
  expiresAt = 0;
}
