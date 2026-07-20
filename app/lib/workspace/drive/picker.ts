/**
 * Google Picker — folder selection. Selecting a folder grants the `drive.file`
 * scope access to that folder and its descendants, which is what makes a
 * folder-as-workspace possible without the restricted `drive` scope.
 */
import { GOOGLE_API_KEY, GOOGLE_PROJECT_NUMBER } from "./config";
import { getAccessToken } from "./auth";
import { loadScript } from "./load-scripts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GAPI_SRC = "https://apis.google.com/js/api.js";
const FOLDER_MIME = "application/vnd.google-apps.folder";

let pickerLoaded: Promise<void> | null = null;

async function ensurePicker(): Promise<void> {
  if (!pickerLoaded) {
    pickerLoaded = (async () => {
      await loadScript(GAPI_SRC);
      const gapi = (window as any).gapi;
      await new Promise<void>((resolve, reject) => {
        gapi.load("picker", {
          callback: () => resolve(),
          onerror: () => reject(new Error("Failed to load Google Picker")),
        });
      });
    })();
  }
  return pickerLoaded;
}

export interface PickedFolder {
  id: string;
  name: string;
}

export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
}

/**
 * Show the Picker in multi-select FILE mode (navigable, optionally rooted at
 * `parentId`). Picking a file grants the app `drive.file` access to it, so it
 * then shows up in the workspace. Resolves [] if cancelled.
 */
export async function pickFiles(parentId?: string): Promise<PickedFile[]> {
  await ensurePicker();
  const token = await getAccessToken(true);
  const google = (window as any).google;

  return new Promise<PickedFile[]>((resolve, reject) => {
    try {
      const view = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);
      if (parentId) view.setParent(parentId);

      const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setAppId(GOOGLE_PROJECT_NUMBER)
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .addView(view)
        .setTitle("Add files to workspace")
        .setCallback((data: any) => {
          const action = data[google.picker.Response.ACTION];
          if (action === google.picker.Action.PICKED) {
            const docs = data[google.picker.Response.DOCUMENTS] || [];
            resolve(
              docs.map((d: any) => ({
                id: d.id,
                name: d.name,
                mimeType: d.mimeType,
                url: d.url,
              })),
            );
          } else if (action === google.picker.Action.CANCEL) {
            resolve([]);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      reject(e);
    }
  });
}

/** Show the Picker in folder-select mode. Resolves null if cancelled. */
export async function pickFolder(): Promise<PickedFolder | null> {
  await ensurePicker();
  const token = await getAccessToken(true);
  const google = (window as any).google;

  return new Promise<PickedFolder | null>((resolve, reject) => {
    try {
      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes(FOLDER_MIME);

      const picker = new google.picker.PickerBuilder()
        .setAppId(GOOGLE_PROJECT_NUMBER)
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .addView(view)
        .setTitle("Select a workspace folder")
        .setCallback((data: any) => {
          const action = data[google.picker.Response.ACTION];
          if (action === google.picker.Action.PICKED) {
            const docs = data[google.picker.Response.DOCUMENTS];
            const doc = docs && docs[0];
            resolve(doc ? { id: doc.id, name: doc.name } : null);
          } else if (action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      reject(e);
    }
  });
}
