import * as React from "react";
import { Autocomplete, TextField } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useGetQuarterOptionsQuery, useGetQuartersQuery } from "../../app/api";
import { selectCurrentTeamKey } from "../../app/teamSlice";
import { useAppSelector } from "../../views/hooks";
import type { Quarter } from "../../types";
import type { FilterOption } from "./FilterAutocomplete";
import useDebouncedSearch from "./useDebouncedSearch";

export type QuarterFilterProps = {
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
  extraOptions?: FilterOption[];
  placeholder?: string;
  sx?: SxProps<Theme>;
};

const EMPTY_QUARTERS: Quarter[] = [];
const EMPTY_OPTIONS: FilterOption[] = [];

/** The suggestion window and name search are shared by every page. */
const QuarterFilter = React.memo(function QuarterFilter({ label = "Фильтр по кварталам", value, onChange, extraOptions = EMPTY_OPTIONS, placeholder, sx }: QuarterFilterProps) {
  const teamKey = useAppSelector(selectCurrentTeamKey);
  const [input, setInput] = React.useState("");
  const search = useDebouncedSearch(input);
  const searchPending = input.trim() !== search;
  const { data: quarters = EMPTY_QUARTERS } = useGetQuartersQuery();
  const { currentData: suggestions = EMPTY_QUARTERS, isFetching, isError } = useGetQuarterOptionsQuery({ teamKey, search });
  const labels = React.useMemo(() => {
    const result = new Map([...quarters, ...suggestions].map(q => [q.id, q.name]));
    extraOptions.forEach(option => result.set(option.value, option.label));
    return result;
  }, [quarters, suggestions, extraOptions]);
  const options = React.useMemo(() => [...suggestions.map(q => ({ value: q.id, label: q.name })),
    ...extraOptions.filter(o => !search || o.label.toLowerCase().includes(search.toLowerCase()))], [suggestions, extraOptions, search]);
  const selected = React.useMemo(() => value.map(id => ({ value: id, label: labels.get(id) ?? id })), [value, labels]);
  return <Autocomplete<FilterOption, true, false, false>
    multiple size="small" disableCloseOnSelect options={searchPending ? [] : options}
    value={selected}
    inputValue={input} loading={isFetching || searchPending} filterOptions={options => options}
    getOptionLabel={option => option.label} isOptionEqualToValue={(a, b) => a.value === b.value}
    onInputChange={(_, next, reason) => { if (reason !== "reset") setInput(next); }}
    onChange={(_, next) => { onChange(next.map(o => o.value)); setInput(""); }}
    noOptionsText={isError ? "Не удалось загрузить кварталы" : "Кварталы не найдены"}
    loadingText="Загрузка…" sx={sx}
    renderInput={params => <TextField {...params} label={label} placeholder={value.length ? undefined : placeholder ?? "Название квартала"} />}
  />;
});

export default QuarterFilter;
