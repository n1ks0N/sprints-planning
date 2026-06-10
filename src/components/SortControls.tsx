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
  selectLabel = "Сортировка",
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
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          px: 1.5,
          py: 1.25,
          bgcolor: "background.paper",
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.25}
        alignItems={{ xs: "stretch", sm: "center" }}
      >
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontWeight: 700,
            lineHeight: { xs: 1.2, sm: 1 },
            textTransform: "uppercase",
          }}
        >
          {label}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 190, flex: "1 1 auto" }}>
            <InputLabel id={labelId}>{selectLabel}</InputLabel>
            <Select
              labelId={labelId}
              label={selectLabel}
              value={value}
              onChange={handleSortChange}
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
              color="primary"
              aria-label={directionTitle}
              onClick={() => onDirectionChange(nextDirection)}
              sx={{
                border: 1,
                borderColor: "divider",
                width: 40,
                height: 40,
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
