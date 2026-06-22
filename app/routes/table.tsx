/**
 * /table — paste-anything spreadsheet.
 *
 * Tier 1 MVP (epic #59). This route is the lazy-loaded entry point; the actual
 * UI lives in app/table/ui/TableApp.tsx so the heavy bits stay in this chunk
 * and out of the shared bundle.
 */
import { TableApp } from "~/table/ui/TableApp";

export default function Table() {
  return <TableApp />;
}
