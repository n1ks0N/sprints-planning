import * as React from "react";
import { Box, Paper, TextField } from "@mui/material";
import type { PaperProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import FilterAutocomplete from "./FilterAutocomplete";
import ReleaseDateField from "../ReleaseDateField";
import type { FilterAutocompleteProps } from "./FilterAutocomplete";
import QuarterFilter from "./QuarterFilter";
import ReleaseFilter from "./ReleaseFilter";

export type SearchFilterConfig = {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  placeholder?: string;
  sx?: SxProps<Theme>;
  commitOnBlurOnly?: boolean;
  debounceMs?: number;
};

function DebouncedSearchField({ value, onChange, onCommit, debounceMs = 250, ...props }: SearchFilterConfig) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  React.useEffect(() => {
    if (draft === value) return;
    const timeout = setTimeout(() => onChange?.(draft), debounceMs);
    return () => clearTimeout(timeout);
  }, [draft, value, debounceMs, onChange]);
  return <TextField label={props.label} placeholder={props.placeholder} sx={props.sx} size="small" fullWidth value={draft}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => { if (draft !== value) onChange?.(draft); onCommit?.(draft); }}
    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); (event.target as HTMLInputElement).blur(); } }} />;
}

export type FiltersPanelFilter =
  | { type: "quarters"; key: string; props: React.ComponentProps<typeof QuarterFilter>; minWidth?: number; maxWidth?: number }
  | { type: "releases"; key: string; props: React.ComponentProps<typeof ReleaseFilter>; minWidth?: number; maxWidth?: number }
  | { type: "releaseDate"; key: string; props: React.ComponentProps<typeof ReleaseDateField>; minWidth?: number; maxWidth?: number }
  | {
      type: "autocomplete";
      key: string;
      props: FilterAutocompleteProps;
      minWidth?: number;
      maxWidth?: number;
    }
  | {
      type: "search";
      key: string;
      props: SearchFilterConfig;
      minWidth?: number;
      maxWidth?: number;
    };

export type FiltersPanelProps = {
  filters: FiltersPanelFilter[];
  actions?: React.ReactNode;
  layout?: "grid" | "wrap";
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

const baseWrapSx: SxProps<Theme> = {
  display: "flex",
  flexWrap: "wrap",
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
  actions,
  layout = "grid",
  withPaper = true,
  paperProps,
  containerSx,
  gridSx,
}: FiltersPanelProps) {
  const isWrapLayout = layout === "wrap";
  const contentSx = isWrapLayout
    ? mergeSx(baseWrapSx, gridSx)
    : mergeSx(baseGridSx, gridSx);

  const content = (
    <Box sx={contentSx}>
      {filters.map((filter) => {
        const baseSx = filter.minWidth ? { minWidth: filter.minWidth } : undefined;
        const wrapItemSx = isWrapLayout
          ? {
              flex: `1 1 ${filter.minWidth ?? 220}px`,
              minWidth: { xs: "100%", sm: filter.minWidth ?? 220 },
              maxWidth: filter.maxWidth ? { xs: "100%", sm: filter.maxWidth } : undefined,
            }
          : undefined;

        if (filter.type === "quarters") {
          return <Box key={filter.key} sx={wrapItemSx ?? baseSx}><QuarterFilter {...filter.props} /></Box>;
        }
        if (filter.type === "releases") {
          return <Box key={filter.key} sx={wrapItemSx ?? baseSx}><ReleaseFilter {...filter.props} /></Box>;
        }
        if (filter.type === "releaseDate") {
          return <Box key={filter.key} sx={wrapItemSx ?? baseSx}><ReleaseDateField {...filter.props} /></Box>;
        }
        if (filter.type === "autocomplete") {
          return <Box key={filter.key} sx={wrapItemSx ?? baseSx}><FilterAutocomplete {...filter.props} /></Box>;
        }

        if (filter.props.debounceMs) {
          const field = <DebouncedSearchField {...filter.props} sx={baseSx ? mergeSx(baseSx, filter.props.sx) : filter.props.sx} />;
          return <Box key={filter.key} sx={wrapItemSx ?? baseSx}>{field}</Box>;
        }

        const {
          label,
          value,
          onChange,
          onCommit,
          placeholder,
          sx,
          commitOnBlurOnly,
        } = filter.props;
        const mergedSx = baseSx ? mergeSx(baseSx, sx) : sx;
        const handleCommit = (nextValue: string) => {
          onChange?.(nextValue);
          onCommit?.(nextValue);
        };

        if (commitOnBlurOnly) {
          const field = (
            <TextField
              key={`${filter.key}-${value}`}
              label={label}
              defaultValue={value}
              onBlur={(e) => handleCommit(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder={placeholder}
              size="small"
              fullWidth
              sx={mergedSx}
            />
          );
          return isWrapLayout ? (
            <Box key={filter.key} sx={wrapItemSx}>
              {field}
            </Box>
          ) : (
            field
          );
        }

        const field = (
          <TextField
            key={filter.key}
            label={label}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onBlur={(e) => onCommit?.(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={placeholder}
            size="small"
            fullWidth
            sx={mergedSx}
          />
        );
        return isWrapLayout ? (
          <Box key={filter.key} sx={wrapItemSx}>
            {field}
          </Box>
        ) : (
          field
        );
      })}
      {actions ? (
        <Box
          sx={{
            minWidth: 200,
            display: "flex",
            justifyContent: { xs: "stretch", md: "flex-end" },
            alignItems: "center",
            ...(isWrapLayout
              ? {
                  flex: "0 0 auto",
                  ml: { xs: 0, md: "auto" },
                }
              : {
                  justifySelf: "stretch",
                  width: "100%",
                  gridColumn: "1 / -1",
                }),
          }}
        >
          {actions}
        </Box>
      ) : null}
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
