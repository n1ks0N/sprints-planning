import * as React from "react";

export default function useDebouncedSearch(input: string) {
  const [search, setSearch] = React.useState("");
  React.useEffect(() => {
    const timeout = setTimeout(() => setSearch(input.trim()), 250);
    return () => clearTimeout(timeout);
  }, [input]);
  return search;
}
