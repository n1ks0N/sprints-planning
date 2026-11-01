import * as React from "react";
import { Autocomplete, TextField } from "@mui/material";
import type { FilterOption } from "./filters/FilterAutocomplete";

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

/** Suggested dates never restrict manual input. Commit once, after validation. */
export default function ReleaseDateField({ label, value, options, onChange }: {
  label: string; value: string; options: FilterOption[]; onChange: (value: string) => void;
}) {
  const selected = options.find(option => option.value === value || parseReleaseDate(option.label) === value);
  const display = selected?.label ?? formatReleaseDate(value);
  React.useEffect(() => {
    const date = selected && parseReleaseDate(selected.label);
    if (date && value !== date) onChange(date);
  }, [value, selected?.label, onChange]);
  const [input, setInput] = React.useState(display);
  const [error, setError] = React.useState(false);
  const lastCommitted = React.useRef(display);
  React.useEffect(() => { setInput(display); lastCommitted.current = display; setError(false); }, [display]);
  const commit = (raw: string) => {
    const text = raw.trim();
    if (text === lastCommitted.current) return;
    if (!text) { lastCommitted.current = ""; setError(false); onChange(""); return; }
    const date = parseReleaseDate(text);
    if (!date) { setError(true); return; }
    setError(false); lastCommitted.current = formatReleaseDate(date); setInput(lastCommitted.current); onChange(date);
  };
  return <Autocomplete<FilterOption, false, false, true>
    freeSolo size="small" options={options} inputValue={input}
    onKeyDown={event => {
      if (event.key === "Enter") { (event as any).defaultMuiPrevented = true; event.preventDefault(); commit(input); }
      if (event.key === "Escape") { setInput(display); setError(false); }
    }}
    value={value ? (selected ?? { value, label: formatReleaseDate(value) }) : null}
    getOptionLabel={option => typeof option === "string" ? option : option.label}
    isOptionEqualToValue={(a, b) => a.value === b.value}
    onInputChange={(_, next, reason) => { if (reason === "input" || reason === "clear") { setInput(next); setError(false); } }}
    onChange={(_, next) => {
      if (typeof next === "string") commit(next);
      else if (next) { setInput(next.label); lastCommitted.current = next.label; setError(false); onChange(parseReleaseDate(next.label) ?? next.value); }
      else commit("");
    }}
    sx={{ minWidth: 180, maxWidth: 260, flex: "1 1 180px" }}
    renderInput={params => <TextField {...params} label={label} placeholder="ДД.ММ.ГГГГ"
      error={error} helperText={error ? "Введите существующую дату: ДД.ММ.ГГГГ" : undefined}
      onBlur={() => commit(input)} />}
  />;
}
