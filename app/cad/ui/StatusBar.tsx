/** Bottom status strip: evaluation state, mesh metrics, and warnings. */
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useCad } from "../hooks/useCad";

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function StatusBar() {
  const status = useCad((s) => s.evalStatus);
  const result = useCad((s) => s.evalResult);
  const error = useCad((s) => s.evalError);
  const warnings = useCad((s) => s.warnings);

  return (
    <div className="flex items-center gap-4 border-t border-border bg-card px-3 py-1.5 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        {status === "pending" && <Loader2 size={13} className="animate-spin" aria-hidden />}
        {status === "ok" && <CheckCircle2 size={13} className="text-accent" aria-hidden />}
        {status === "error" && <XCircle size={13} className="text-red-400" aria-hidden />}
        {status === "pending" ? "Evaluating…" : status === "error" ? "Error" : "Ready"}
      </span>

      {result && status === "ok" && (
        <>
          <span>Volume: {fmt(result.volume)} mm³</span>
          <span>Area: {fmt(result.surfaceArea)} mm²</span>
          <span>Triangles: {fmt(result.triangles)}</span>
        </>
      )}

      {error && <span className="truncate text-red-400">{error}</span>}

      {warnings.length > 0 && (
        <span className="flex items-center gap-1.5 truncate text-amber-400">
          <AlertTriangle size={13} aria-hidden />
          {warnings.join(" · ")}
        </span>
      )}
    </div>
  );
}
