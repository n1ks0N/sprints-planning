import * as React from "react";
import { Autocomplete, TextField } from "@mui/material";
import type {
  AutocompleteInputChangeReason,
  AutocompleteChangeReason,
} from "@mui/material/Autocomplete";
import type { SxProps, Theme } from "@mui/material/styles";

export type FilterOption = {
  value: string;
  label: string;
};

type OptionInput = string | FilterOption | null | undefined;

type BaseProps = {
  label: string;
  options: OptionInput[];
  allowCustom?: boolean;
  placeholder?: string;
  size?: "small" | "medium";
  sx?: SxProps<Theme>;
  disableClearable?: boolean;
  helperText?: React.ReactNode;
};

type MultipleProps = BaseProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
};

export type FilterAutocompleteProps = MultipleProps | SingleProps;

type Normalized = {
  list: FilterOption[];
  byValue: Map<string, FilterOption>;
};

const EMPTY_NORMALIZED: Normalized = { list: [], byValue: new Map() };

function normalizeOptions(options: OptionInput[]): Normalized {
  if (!options.length) return EMPTY_NORMALIZED;
  const byValue = new Map<string, FilterOption>();
  for (const raw of options) {
    if (raw == null) continue;
    const option: FilterOption =
      typeof raw === "string"
        ? {
            value: raw.trim(),
            label: raw.trim(),
          }
        : {
            value: raw.value?.trim() ?? "",
            label: raw.label?.trim() || raw.value?.trim() || "",
          };
    if (!option.value) continue;
    if (!byValue.has(option.value)) {
      byValue.set(option.value, {
        value: option.value,
        label: option.label || option.value,
      });
    }
  }
  const list = Array.from(byValue.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "ru")
  );
  return { list, byValue };
}

const toUniqueList = (values: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const val = raw.trim();
    if (!val || seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }
  return out;
};

export function FilterAutocomplete(props: FilterAutocompleteProps) {
  const {
    label,
    options,
    allowCustom = true,
    placeholder,
    size = "small",
    sx,
    disableClearable,
    helperText,
  } = props;

  const normalized = React.useMemo(
    () => normalizeOptions(options),
    [options]
  );

  const buildOption = React.useCallback(
    (value: string): FilterOption => {
      const fromMap = normalized.byValue.get(value);
      if (fromMap) return fromMap;
      const trimmed = value.trim();
      return { value: trimmed, label: trimmed };
    },
    [normalized.byValue]
  );

  if (props.multiple) {
    const selected = React.useMemo(
      () => props.value.map((val) => buildOption(val)),
      [props.value, buildOption]
    );

    const handleChange = (
      _: any,
      value: Array<FilterOption | string>,
      _reason: AutocompleteChangeReason
    ) => {
      const rawValues = value.map((item) =>
        typeof item === "string" ? item : item.value
      );
      props.onChange(toUniqueList(rawValues));
    };

    return (
      <Autocomplete
        multiple
        options={normalized.list}
        freeSolo={allowCustom}
        value={selected}
        onChange={handleChange}
        sx={sx}
        size={size}
        disableClearable={disableClearable}
        clearOnBlur={!allowCustom}
        filterSelectedOptions
        fullWidth
        getOptionLabel={(option) =>
          typeof option === "string" ? option : option.label
        }
        isOptionEqualToValue={(option, value) =>
          (typeof option === "string" ? option : option.value) ===
          (typeof value === "string" ? value : value.value)
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={placeholder}
            size={size}
            helperText={helperText}
          />
        )}
      />
    );
  }

  const singleValue = props.value ? buildOption(props.value) : null;

  const [inputValue, setInputValue] = React.useState(
    singleValue?.label ?? ""
  );

  React.useEffect(() => {
    setInputValue(singleValue?.label ?? props.value ?? "");
  }, [singleValue, props.value]);

  const handleSingleChange = (
    _: any,
    value: FilterOption | string | null
  ) => {
    const next =
      typeof value === "string"
        ? value
        : value?.value ?? (allowCustom ? inputValue : "");
    props.onChange(next.trim());
  };

  const handleInputChange = (
    _: any,
    value: string,
    reason: AutocompleteInputChangeReason
  ) => {
    setInputValue(value);
    if (allowCustom && (reason === "input" || reason === "clear")) {
      props.onChange(value.trim());
    }
  };

  return (
    <Autocomplete
      options={normalized.list}
      freeSolo={allowCustom}
      value={singleValue}
      onChange={handleSingleChange}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      sx={sx}
      size={size}
      disableClearable={disableClearable}
      clearOnBlur={!allowCustom}
      fullWidth
      getOptionLabel={(option) =>
        typeof option === "string" ? option : option.label
      }
      isOptionEqualToValue={(option, value) =>
        (typeof option === "string" ? option : option.value) ===
        (typeof value === "string" ? value : value.value)
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          size={size}
          helperText={helperText}
        />
      )}
    />
  );
}

export default FilterAutocomplete;
