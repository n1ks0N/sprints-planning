import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { hasAnyParams } from "../../views/filterUrl";

type FilterUrlSyncOptions = {
  filterParamKeys: string[];
  hasStoredFilters: boolean;
  buildSearchParams: () => URLSearchParams;
  applyFiltersFromParams: (params: URLSearchParams) => void;
};

export default function useFilterUrlSync({
  filterParamKeys,
  hasStoredFilters,
  buildSearchParams,
  applyFiltersFromParams,
}: FilterUrlSyncOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const hasUrlFilters = React.useMemo(
    () => hasAnyParams(searchParams, filterParamKeys),
    [filterParamKeys, searchParams]
  );
  const lastSyncedQueryRef = React.useRef<string | null>(null);
  const isApplyingUrlRef = React.useRef(false);

  React.useEffect(() => {
    const currentQuery = searchParams.toString();
    if (lastSyncedQueryRef.current === currentQuery) return;
    if (hasUrlFilters) {
      isApplyingUrlRef.current = true;
      applyFiltersFromParams(searchParams);
      isApplyingUrlRef.current = false;
      lastSyncedQueryRef.current = currentQuery;
      return;
    }
    if (hasStoredFilters) {
      const nextParams = buildSearchParams();
      const nextQuery = nextParams.toString();
      if (nextQuery === currentQuery) {
        lastSyncedQueryRef.current = currentQuery;
        return;
      }
      lastSyncedQueryRef.current = nextQuery;
      setSearchParams(nextParams, { replace: true });
      return;
    }
    lastSyncedQueryRef.current = currentQuery;
  }, [
    applyFiltersFromParams,
    buildSearchParams,
    hasStoredFilters,
    hasUrlFilters,
    searchParams,
    setSearchParams,
  ]);

  React.useEffect(() => {
    if (isApplyingUrlRef.current) return;
    const currentQuery = searchParams.toString();
    const nextParams = buildSearchParams();
    const nextQuery = nextParams.toString();
    if (nextQuery === currentQuery) {
      lastSyncedQueryRef.current = currentQuery;
      return;
    }
    lastSyncedQueryRef.current = nextQuery;
    setSearchParams(nextParams, { replace: true });
  }, [buildSearchParams, searchParams, setSearchParams]);
}
