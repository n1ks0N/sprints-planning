import * as React from "react";
import { Autocomplete, TextField } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useGetReleaseOptionsQuery, type ReleaseOption } from "../../app/api";
import { selectCurrentTeamKey } from "../../app/teamSlice";
import { useAppSelector } from "../../views/hooks";
import { formatReleaseDate, isReleaseDate, parseReleaseDate } from "../../utils/releaseDate";
import useDebouncedSearch from "./useDebouncedSearch";

const EMPTY_OPTIONS: ReleaseOption[] = [];

export type ReleaseFilterProps = {
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
  quarterIds: string[];
  sx?: SxProps<Theme>;
  ready?: boolean;
};

const ReleaseFilter = React.memo(function ReleaseFilter({ label = "Релиз", value, onChange, quarterIds, sx, ready = true }: ReleaseFilterProps) {
  const teamKey = useAppSelector(selectCurrentTeamKey);
  const [input, setInput] = React.useState("");
  const [error, setError] = React.useState(false);
  const search = useDebouncedSearch(input);
  const searchPending = input.trim() !== search;
  const { currentData: suggestions = EMPTY_OPTIONS, isFetching, isError, isSuccess } = useGetReleaseOptionsQuery({ teamKey, quarterIds, search }, { skip: !ready });
  const missingLegacyIds = React.useMemo(() => value.filter(v => !isReleaseDate(v) && !suggestions.some(option => option.id === v)), [value, suggestions]);
  const { currentData: legacyOptions = EMPTY_OPTIONS } = useGetReleaseOptionsQuery({ teamKey, ids: missingLegacyIds }, {
    skip: !ready || isFetching || !isSuccess || !missingLegacyIds.length,
  });
  React.useEffect(() => {
    if (!value.some(v => !isReleaseDate(v))) return;
    const dates = new Map([...suggestions, ...legacyOptions].map(option => [option.id, option.promDate]));
    const normalized = [...new Set(value.map(v => dates.get(v) ?? v))];
    if (normalized.some((v, i) => v !== value[i]) || normalized.length !== value.length) onChange(normalized);
  }, [suggestions, legacyOptions, value, onChange]);
  const change = (next: string[]) => { onChange([...new Set(next)]); setInput(""); setError(false); };
  const commit = () => {
    if (!input.trim()) return;
    const date = parseReleaseDate(input);
    if (!date) { setError(true); return; }
    change([...value, date]);
  };
  return <Autocomplete<string, true, false, true>
    multiple freeSolo size="small" disableCloseOnSelect options={searchPending ? [] : suggestions.map(o => o.promDate)}
    value={value} inputValue={input} loading={isFetching || searchPending} filterOptions={options => options}
    getOptionLabel={formatReleaseDate}
    onInputChange={(_, next, reason) => { if (reason !== "reset") { setInput(next); setError(false); } }}
    onChange={(_, next) => {
      const normalized = next.map(v => parseReleaseDate(v) ?? (value.includes(v) ? v : ""));
      if (normalized.some(v => !v)) { setError(true); return; }
      change(normalized);
    }}
    onKeyDown={event => {
      if (event.key === "Enter" && input.trim()) {
        // A complete manual date takes precedence over a previously highlighted suggestion.
        if (parseReleaseDate(input) || !event.currentTarget.querySelector('[aria-activedescendant]')?.getAttribute('aria-activedescendant')) {
          (event as React.KeyboardEvent & { defaultMuiPrevented?: boolean }).defaultMuiPrevented = true;
          event.preventDefault(); commit();
        }
      }
      if (event.key === "Escape") { setInput(""); setError(false); }
    }}
    noOptionsText={isError ? "Не удалось загрузить релизы" : "Введите дату релиза"} loadingText="Загрузка…" sx={sx}
    renderInput={params => <TextField {...params} label={label} placeholder={value.length ? undefined : "ДД.ММ.ГГГГ"} onBlur={commit}
      error={error} helperText={error ? "Введите существующую дату: ДД.ММ.ГГГГ" : undefined} />}
  />;
});

export default ReleaseFilter;
