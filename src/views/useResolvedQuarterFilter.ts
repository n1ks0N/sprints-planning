import * as React from "react";
import type { Quarter } from "../types";

const EMPTY_IDS: string[] = [];
const equal = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

/** Resolve defaults before dependent queries run; persist the same scope after commit. */
export default function useResolvedQuarterFilter(
  quarters: Quarter[] | undefined,
  storedIds: string[],
  onChange: (ids: string[]) => void,
  currentQuarterId?: string | null,
  withoutQuarter = false,
) {
  const initialized = React.useRef(false);
  const available = React.useMemo(() => new Set(quarters?.map(q => q.id)), [quarters]);
  const quarterIds = React.useMemo(() => {
    if (!quarters) return storedIds;
    const valid = storedIds.filter(id => available.has(id));
    if (valid.length) return equal(valid, storedIds) ? storedIds : valid;
    if (!withoutQuarter && currentQuarterId && (!initialized.current || storedIds.length)) return [currentQuarterId];
    return storedIds.length ? EMPTY_IDS : storedIds;
  }, [quarters, storedIds, available, currentQuarterId, withoutQuarter]);

  React.useEffect(() => {
    if (!quarters) return;
    if (currentQuarterId || storedIds.length || withoutQuarter) initialized.current = true;
    if (!equal(quarterIds, storedIds)) onChange(quarterIds);
  }, [quarters, currentQuarterId, quarterIds, storedIds, withoutQuarter, onChange]);

  return quarterIds;
}
