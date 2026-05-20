/**
 * Image import utilities.
 *
 * Accepts a File or Blob and returns an ImageBitmap.
 * Uses createImageBitmap with imageOrientation:'from-image' to auto-apply
 * EXIF orientation (handles rotated JPEGs without a parser library).
 *
 * Falls back to the 1-argument form on browsers that don't support the
 * 2-argument options (older Safari).
 *
 * NOTE: We only ever import from user-picked files / clipboard, so the
 * resulting canvas is never tainted by cross-origin content.
 */

export type PlacementMode = "fit" | "centre" | "replace";

export async function fileToImageBitmap(file: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Fallback for older browsers (Safari < 17 doesn't support options form).
    return await createImageBitmap(file);
  }
}

/**
 * Decode a DataTransferItem (from drag-drop or paste) to an ImageBitmap.
 * Returns null if the item is not an image.
 */
export async function dataTransferItemToImageBitmap(item: DataTransferItem): Promise<ImageBitmap | null> {
  if (!item.type.startsWith("image/")) return null;
  const blob = item.getAsFile();
  if (!blob) return null;
  return fileToImageBitmap(blob);
}

/**
 * Read an ImageBitmap from the clipboard.
 * Returns null if the clipboard contains no image, or if the API is unavailable/denied.
 */
export async function clipboardToImageBitmap(): Promise<ImageBitmap | null> {
  try {
    if (!navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) {
        const blob = await item.getType(type);
        return fileToImageBitmap(blob);
      }
    }
    return null;
  } catch {
    return null;
  }
}
