/**
 * pdfjs worker entry — re-exports the prebuilt worker so scripts/build.ts can
 * emit it as a single fixed-name asset (`/assets/pdf-worker.js`). The main
 * thread points `GlobalWorkerOptions.workerSrc` at that URL.
 *
 * We re-export rather than copy the file from node_modules because Bun.build
 * already knows how to bundle the worker entry as ESM with the correct
 * minification + browser target, matching the rest of our chunks.
 */
// Polyfill must be installed before the worker bundle evaluates — same reason
// as in pdfjs.ts. See app/pdf/io/polyfills.ts.
import "./polyfills";
import "pdfjs-dist/build/pdf.worker.min.mjs";
