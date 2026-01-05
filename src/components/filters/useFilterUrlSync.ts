import * as React from "react";
import { useSearchParams } from "react-router-dom";

type FilterUrlSyncOptions = {
  buildSearchParams: () => URLSearchParams;
  applyFiltersFromParams: (params: URLSearchParams) => void;
};

export default function useFilterUrlSync({
  buildSearchParams,
  applyFiltersFromParams,
}: FilterUrlSyncOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const lastSyncedQueryRef = React.useRef<string | null>(null);
  const isApplyingUrlRef = React.useRef(false);

  React.useEffect(() => {
    const currentQuery = searchParams.toString();
    if (lastSyncedQueryRef.current === currentQuery) return;
    lastSyncedQueryRef.current = currentQuery;
    isApplyingUrlRef.current = true;
    applyFiltersFromParams(searchParams);
    isApplyingUrlRef.current = false;
  }, [
    applyFiltersFromParams,
    searchParams,
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
