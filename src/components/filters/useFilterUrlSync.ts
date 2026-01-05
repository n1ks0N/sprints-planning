import * as React from "react";
import { useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";

type FilterUrlSyncOptions = {
  buildSearchParams: () => URLSearchParams;
  applyFiltersFromParams: (params: URLSearchParams) => void;
};

export default function useFilterUrlSync({
  buildSearchParams,
  applyFiltersFromParams,
}: FilterUrlSyncOptions) {
  const [, setSearchParams] = useSearchParams();
  const lastSyncedQueryRef = React.useRef<string | null>(null);
  const isApplyingUrlRef = React.useRef(false);
  const urlQuery = useSyncExternalStore(subscribeToLocation, getLocationSearch);

  React.useEffect(() => {
    const currentQuery = urlQuery;
    if (lastSyncedQueryRef.current === currentQuery) return;
    lastSyncedQueryRef.current = currentQuery;
    isApplyingUrlRef.current = true;
    applyFiltersFromParams(new URLSearchParams(currentQuery));
    isApplyingUrlRef.current = false;
  }, [
    applyFiltersFromParams,
    urlQuery,
  ]);

  React.useEffect(() => {
    if (isApplyingUrlRef.current) return;
    const currentQuery = urlQuery;
    const nextParams = buildSearchParams();
    const nextQuery = nextParams.toString();
    if (nextQuery === currentQuery) {
      lastSyncedQueryRef.current = currentQuery;
      return;
    }
    lastSyncedQueryRef.current = nextQuery;
    setSearchParams(nextParams, { replace: true });
  }, [buildSearchParams, setSearchParams, urlQuery]);
}

function getLocationSearch() {
  if (typeof window === "undefined") return "";
  return window.location.search.replace(/^\?/, "");
}

function subscribeToLocation(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  ensureHistoryEvents();
  window.addEventListener("popstate", callback);
  window.addEventListener("pushstate", callback);
  window.addEventListener("replacestate", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("pushstate", callback);
    window.removeEventListener("replacestate", callback);
  };
}

let historyEventsInstalled = false;
function ensureHistoryEvents() {
  if (historyEventsInstalled || typeof window === "undefined") return;
  historyEventsInstalled = true;
  const { pushState, replaceState } = window.history;
  window.history.pushState = function pushStateWithEvent(...args) {
    const result = pushState.apply(this, args as Parameters<History["pushState"]>);
    window.dispatchEvent(new Event("pushstate"));
    return result;
  };
  window.history.replaceState = function replaceStateWithEvent(...args) {
    const result = replaceState.apply(
      this,
      args as Parameters<History["replaceState"]>
    );
    window.dispatchEvent(new Event("replacestate"));
    return result;
  };
}
