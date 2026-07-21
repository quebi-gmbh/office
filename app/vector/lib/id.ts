/** Short, collision-resistant node id generator. */
let counter = 0;

export function newId(prefix = "n"): string {
  counter += 1;
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}-${counter}`;
}
