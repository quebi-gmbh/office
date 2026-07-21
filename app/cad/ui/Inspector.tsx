/**
 * The property inspector for the selected feature. Editing a value mutates the
 * feature through the store, which pushes history and re-evaluates downstream.
 */
import { useCad, useCadStore } from "../hooks/useCad";
import type { BooleanOp, Feature } from "../lib/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
  min,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-24 rounded border border-border bg-bg px-2 py-1 text-right text-sm"
    />
  );
}

function BooleanSelect({ value, onChange }: { value: BooleanOp; onChange: (v: BooleanOp) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as BooleanOp)}
      className="rounded border border-border bg-bg px-2 py-1 text-sm"
    >
      <option value="new">New body</option>
      <option value="add">Add (union)</option>
      <option value="subtract">Subtract</option>
    </select>
  );
}

export function Inspector() {
  const store = useCadStore();
  const selectedId = useCad((s) => s.selectedId);
  const feature = useCad((s) => s.doc.features.find((f) => f.id === s.selectedId) ?? null);

  const patch = (recipe: (f: Feature) => void) =>
    store.getState().update((d) => {
      const f = d.features.find((x) => x.id === selectedId);
      if (f) recipe(f);
    });

  return (
    <div className="flex w-64 shrink-0 flex-col border-l border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Properties
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!feature && <p className="text-xs text-muted">Select a feature to edit its parameters.</p>}

        {feature && (
          <>
            <Field label="Name">
              <input
                value={feature.name}
                onChange={(e) => patch((f) => (f.name = e.target.value))}
                className="w-32 rounded border border-border bg-bg px-2 py-1 text-sm"
              />
            </Field>

            {feature.type === "sketch" && (
              <>
                <Field label="Plane">
                  <span className="text-sm">{feature.sketch.plane}</span>
                </Field>
                <Field label="Entities">
                  <span className="text-sm">{feature.sketch.entities.length}</span>
                </Field>
                <button
                  type="button"
                  onClick={() => store.getState().openSketch(feature.id)}
                  className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm hover:border-accent"
                >
                  Edit sketch
                </button>
              </>
            )}

            {feature.type === "extrude" && (
              <>
                <Field label="Depth">
                  <NumberInput
                    value={feature.depth}
                    min={0}
                    onChange={(v) => patch((f) => f.type === "extrude" && (f.depth = v))}
                  />
                </Field>
                <Field label="Symmetric">
                  <input
                    type="checkbox"
                    checked={feature.symmetric}
                    onChange={(e) => patch((f) => f.type === "extrude" && (f.symmetric = e.target.checked))}
                  />
                </Field>
                <Field label="Reverse">
                  <input
                    type="checkbox"
                    checked={feature.reverse}
                    onChange={(e) => patch((f) => f.type === "extrude" && (f.reverse = e.target.checked))}
                  />
                </Field>
                <Field label="Boolean">
                  <BooleanSelect
                    value={feature.boolean}
                    onChange={(v) => patch((f) => f.type === "extrude" && (f.boolean = v))}
                  />
                </Field>
              </>
            )}

            {feature.type === "revolve" && (
              <>
                <Field label="Angle (°)">
                  <NumberInput
                    value={feature.angle}
                    min={1}
                    onChange={(v) => patch((f) => f.type === "revolve" && (f.angle = Math.min(360, v)))}
                  />
                </Field>
                <Field label="Boolean">
                  <BooleanSelect
                    value={feature.boolean}
                    onChange={(v) => patch((f) => f.type === "revolve" && (f.boolean = v))}
                  />
                </Field>
              </>
            )}

            {feature.type === "box" && (
              <>
                <Field label="Width (X)">
                  <NumberInput value={feature.w} min={0} onChange={(v) => patch((f) => f.type === "box" && (f.w = v))} />
                </Field>
                <Field label="Depth (Y)">
                  <NumberInput value={feature.d} min={0} onChange={(v) => patch((f) => f.type === "box" && (f.d = v))} />
                </Field>
                <Field label="Height (Z)">
                  <NumberInput value={feature.h} min={0} onChange={(v) => patch((f) => f.type === "box" && (f.h = v))} />
                </Field>
              </>
            )}

            {feature.type === "cylinder" && (
              <>
                <Field label="Radius">
                  <NumberInput value={feature.r} min={0} onChange={(v) => patch((f) => f.type === "cylinder" && (f.r = v))} />
                </Field>
                <Field label="Height">
                  <NumberInput value={feature.h} min={0} onChange={(v) => patch((f) => f.type === "cylinder" && (f.h = v))} />
                </Field>
              </>
            )}

            {feature.type === "sphere" && (
              <Field label="Radius">
                <NumberInput value={feature.r} min={0} onChange={(v) => patch((f) => f.type === "sphere" && (f.r = v))} />
              </Field>
            )}

            {(feature.type === "box" || feature.type === "cylinder" || feature.type === "sphere") && (
              <>
                <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Position</div>
                {(["x", "y", "z"] as const).map((axis, i) => (
                  <Field key={axis} label={axis.toUpperCase()}>
                    <NumberInput
                      value={feature.position[i]}
                      onChange={(v) =>
                        patch((f) => {
                          if (f.type === "box" || f.type === "cylinder" || f.type === "sphere") f.position[i] = v;
                        })
                      }
                    />
                  </Field>
                ))}
                <Field label="Boolean">
                  <BooleanSelect
                    value={feature.boolean}
                    onChange={(v) =>
                      patch((f) => {
                        if (f.type === "box" || f.type === "cylinder" || f.type === "sphere") f.boolean = v;
                      })
                    }
                  />
                </Field>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
