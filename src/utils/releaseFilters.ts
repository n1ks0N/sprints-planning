import { isReleaseDate } from "./releaseDate";

export function releaseFilterParams(values: string[]) {
  const dates = [...new Set(values.filter(isReleaseDate))].sort();
  const ids = [...new Set(values.filter(value => !isReleaseDate(value)))].sort();
  return {
    releaseDateIds: ids.length ? ids : undefined,
    releasePromDates: dates.length ? dates : undefined,
  };
}
