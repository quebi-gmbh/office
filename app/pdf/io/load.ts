/**
 * File-input / URL / drag-and-drop loaders. Returns plain { name, bytes }
 * shapes so the UI can hand them straight to the OpenDoc store.
 */
export type LoadedFile = { name: string; bytes: Uint8Array };

export async function pickPdfFiles(multiple = true): Promise<LoadedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.multiple = multiple;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      const out: LoadedFile[] = [];
      for (const f of files) {
        const buf = await f.arrayBuffer();
        out.push({ name: f.name, bytes: new Uint8Array(buf) });
      }
      resolve(out);
    };
    input.click();
  });
}

export async function pickImageFiles(): Promise<LoadedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,.png,.jpg,.jpeg";
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      const out: LoadedFile[] = [];
      for (const f of files) {
        const buf = await f.arrayBuffer();
        out.push({ name: f.name, bytes: new Uint8Array(buf) });
      }
      resolve(out);
    };
    input.click();
  });
}

export async function fetchPdfFromUrl(url: string): Promise<LoadedFile> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);
  const buf = await resp.arrayBuffer();
  const name = (() => {
    try {
      const u = new URL(url);
      const last = u.pathname.split("/").filter(Boolean).pop();
      return last && /\.pdf$/i.test(last) ? last : "downloaded.pdf";
    } catch {
      return "downloaded.pdf";
    }
  })();
  return { name, bytes: new Uint8Array(buf) };
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    /\.pdf$/i.test(file.name)
  );
}
