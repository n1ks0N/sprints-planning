export const isReleaseDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
export function parseReleaseDate(raw: string): string | null {
  const value = raw.trim();
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  const iso = ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : value;
  if (!isReleaseDate(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? iso : null;
}
export const formatReleaseDate = (value: string) => isReleaseDate(value) ? value.split("-").reverse().join(".") : value;
