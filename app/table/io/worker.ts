/**
 * Web Worker entry — runs the heavy, pure data operations (sort + group +
 * aggregate) off the main thread so big sheets don't freeze the UI. The doc is
 * structured-cloneable (plain arrays), so it round-trips cheaply.
 */
import { type TableDoc } from "~/table/lib/model";
import { type SortKey, sortDoc } from "~/table/lib/sort";
import { type AggSpec, groupAggregate } from "~/table/lib/transforms";
import { type Locale } from "~/table/lib/coltypes";

type Req =
  | { id: number; op: "sort"; doc: TableDoc; spec: SortKey[]; locale: Locale }
  | { id: number; op: "group"; doc: TableDoc; groupCols: number[]; aggs: AggSpec[] };

self.onmessage = (e: MessageEvent<Req>) => {
  const msg = e.data;
  try {
    if (msg.op === "sort") {
      const doc = sortDoc(msg.doc, msg.spec, msg.locale);
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, doc });
    } else if (msg.op === "group") {
      const rows = groupAggregate(msg.doc, msg.groupCols, msg.aggs);
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, rows });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, error: (err as Error).message });
  }
};
