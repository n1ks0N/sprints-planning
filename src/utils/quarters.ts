import type { Quarter } from "../types";

export function areStringArraysEqual(
  a: readonly string[],
  b: readonly string[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function filterExistingQuarterIds(
  selectedIds: readonly string[],
  quarters: readonly Quarter[]
): string[] {
  if (!selectedIds.length || !quarters.length) return selectedIds.slice();
  const validIds = new Set(quarters.map((q) => q.id));
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const id of selectedIds) {
    if (!validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  return unique;
}

export function findCurrentQuarterId(
  quarters: readonly Quarter[]
): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const current = quarters.find(
    (q) => q.startDate <= today && today <= q.endDate
  );
  return current ? current.id : null;
}
