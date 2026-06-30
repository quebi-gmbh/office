/**
 * pdfjs worker entry. Imported with Vite's `?worker` suffix from
 * app/pdf/io/pdfjs.ts, which bundles this module into a dedicated worker chunk
 * and gives back a Worker constructor. The main thread hands the instance to
 * pdfjs via `GlobalWorkerOptions.workerPort`.
 *
 * The polyfill side-effect import below must run inside the worker too (pdfjs v6
 * calls getOrInsertComputed on the worker thread), which is exactly why we wrap
 * the upstream worker in our own entry instead of pointing at it directly.
 */
// Polyfill must be installed before the worker bundle evaluates — same reason
// as in pdfjs.ts. See app/pdf/io/polyfills.ts.
import "./polyfills";
import "pdfjs-dist/build/pdf.worker.min.mjs";
