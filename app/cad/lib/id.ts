/** Short, collision-resistant ids for features, entities, and constraints. */
let counter = 0;

export function uid(prefix = "f"): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
