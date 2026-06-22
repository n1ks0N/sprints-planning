import * as React from "react";
import {
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import type { SxProps, Theme } from "@mui/material/styles";
import { ArrowDownward, ArrowUpward } from "@mui/icons-material";

export type SortOption = {
  value: string;
  label: string;
};

export type SortDirection = "asc" | "desc";

type SortControlsProps = {
  value: string;
  onChange: (value: string) => void;
  options: SortOption[];
  direction: SortDirection;
  onDirectionChange: (direction: SortDirection) => void;
  label?: string;
  selectLabel?: string;
  sx?: SxProps<Theme>;
};

export default function SortControls({
  value,
  onChange,
  options,
  direction,
  onDirectionChange,
  label = "Сортировка",
  selectLabel = "Поле",
  sx,
}: SortControlsProps) {
  const labelId = React.useId();
  const handleSortChange = (event: SelectChangeEvent<string>) => {
    onChange(event.target.value);
  };

  const nextDirection: SortDirection = direction === "asc" ? "desc" : "asc";
  const directionTitle = direction === "asc" ? "По возрастанию" : "По убыванию";

  return (
    <Box
      sx={[
        {
          display: "inline-flex",
          maxWidth: "100%",
          py: 0.25,
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={0.75}
        alignItems={{ xs: "stretch", sm: "center" }}
      >
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontWeight: 600,
            lineHeight: { xs: 1.2, sm: 1 },
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 164, flex: "1 1 auto" }}>
            <InputLabel id={labelId}>{selectLabel}</InputLabel>
            <Select
              labelId={labelId}
              label={selectLabel}
              value={value}
              onChange={handleSortChange}
              sx={{
                height: 34,
                bgcolor: "background.paper",
                "& .MuiSelect-select": {
                  py: 0.75,
                  pr: 3.5,
                },
              }}
            >
              {options.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title={directionTitle}>
            <IconButton
              color="default"
              aria-label={directionTitle}
              onClick={() => onDirectionChange(nextDirection)}
              sx={{
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                width: 34,
                height: 34,
                flex: "0 0 auto",
              }}
            >
              {direction === "asc" ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </Box>
  );
}
