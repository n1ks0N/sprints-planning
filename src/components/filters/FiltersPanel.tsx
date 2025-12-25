import * as React from "react";
import { Box, Paper, TextField } from "@mui/material";
import type { PaperProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import FilterAutocomplete from "./FilterAutocomplete";
import type { FilterAutocompleteProps } from "./FilterAutocomplete";

export type SearchFilterConfig = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  placeholder?: string;
  sx?: SxProps<Theme>;
};

export type FiltersPanelFilter =
  | {
      type: "autocomplete";
      key: string;
      props: FilterAutocompleteProps;
      minWidth?: number;
    }
  | {
      type: "search";
      key: string;
      props: SearchFilterConfig;
      minWidth?: number;
    };

export type FiltersPanelProps = {
  filters: FiltersPanelFilter[];
  withPaper?: boolean;
  paperProps?: PaperProps;
  containerSx?: SxProps<Theme>;
  gridSx?: SxProps<Theme>;
};

const baseGridSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: {
    xs: "repeat(auto-fit, minmax(220px, 1fr))",
    md: "repeat(auto-fit, minmax(200px, 1fr))",
  },
  gridAutoFlow: "row dense",
  gap: 2,
  alignItems: "center",
};

const mergeSx = (
  base: SxProps<Theme>,
  override?: SxProps<Theme>
): SxProps<Theme> => {
  if (!override) return base;
  const baseArray = Array.isArray(base) ? base : [base];
  const overrideArray = Array.isArray(override) ? override : [override];
  return [...baseArray, ...overrideArray];
};

export default function FiltersPanel({
  filters,
  withPaper = true,
  paperProps,
  containerSx,
  gridSx,
}: FiltersPanelProps) {
  const content = (
    <Box sx={mergeSx(baseGridSx, gridSx)}>
      {filters.map((filter) => {
        if (filter.type === "autocomplete") {
          const baseSx = filter.minWidth
            ? { minWidth: filter.minWidth }
            : undefined;
          const sx = baseSx
            ? mergeSx(baseSx, filter.props.sx)
            : filter.props.sx;
          return (
            <FilterAutocomplete
              key={filter.key}
              {...filter.props}
              sx={sx}
            />
          );
        }

        const { label, value, onChange, onCommit, placeholder, sx } =
          filter.props;
        const baseSx = filter.minWidth ? { minWidth: filter.minWidth } : undefined;
        const mergedSx = baseSx ? mergeSx(baseSx, sx) : sx;

        return (
          <TextField
            key={filter.key}
            label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onCommit?.()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder={placeholder}
            size="small"
            fullWidth
            sx={mergedSx}
          />
        );
      })}
    </Box>
  );

  if (!withPaper) {
    return <Box sx={containerSx}>{content}</Box>;
  }

  return (
    <Paper variant="outlined" sx={mergeSx({ p: 2 }, containerSx)} {...paperProps}>
      {content}
    </Paper>
  );
}
