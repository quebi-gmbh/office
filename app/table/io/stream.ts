/**
 * Streaming CSV/TSV parse for large files (> ~1 MB) via PapaParse.
 *
 * PapaParse is dynamically imported so it stays out of the initial chunk and is
 * only fetched when a big file is actually dropped. Parsing runs chunk-by-chunk
 * off the file stream, reporting progress, so a multi-hundred-MB CSV doesn't
 * block the main thread or balloon memory before the grid can show anything.
 */
import { docFromRows, type TableDoc } from "~/table/lib/model";
import { guessHasHeader } from "~/lib/table/detect";

export const STREAM_THRESHOLD = 1_000_000; // 1 MB

export interface StreamProgress {
  rows: number;
  bytes: number;
  total: number;
}

/**
 * Parse a delimited file in streaming mode. Calls `onProgress` periodically and
 * resolves with the finished doc. `delimiter` empty → PapaParse auto-detects.
 */
export async function streamParse(
  file: File,
  opts: { delimiter?: string; onProgress?: (p: StreamProgress) => void },
): Promise<TableDoc> {
  const Papa = (await import("papaparse")).default;
  const rows: string[][] = [];
  const total = file.size;
  let lastTick = 0;

  await new Promise<void>((resolve, reject) => {
    Papa.parse<string[]>(file, {
      delimiter: opts.delimiter ?? "",
      skipEmptyLines: true,
      worker: false,
      chunk: (results, parser) => {
        for (const row of results.data) rows.push(row as string[]);
        const bytes = results.meta.cursor ?? 0;
        const now = Date.now();
        if (now - lastTick > 80) {
          lastTick = now;
          opts.onProgress?.({ rows: rows.length, bytes, total });
        }
        void parser;
      },
      complete: () => resolve(),
      error: (err: unknown) => reject(err),
    });
  });

  const name = file.name.replace(/\.[^.]+$/, "");
  const doc = docFromRows(rows.length ? rows : [[""]], name, guessHasHeader(rows));
  return doc;
}
