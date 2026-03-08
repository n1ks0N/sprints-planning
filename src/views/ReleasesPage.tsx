// src/views/ReleasesPage.tsx
import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Box,
  Button,
  IconButton,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Tooltip,
  Checkbox,
  FormControlLabel,
  TableContainer,
} from "@mui/material";
import { Add, Delete, Backspace } from "@mui/icons-material";
import moment from "moment";
import "moment/locale/ru";

import {
  useGetReleasesQuery,
  useAddReleaseMutation,
  useUpdateReleaseMutation,
  useDeleteReleaseMutation,
} from "../app/api";
import type { Release, ReleaseAnchorField } from "../types";

moment.locale("ru");

function toISOlocal(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const ru = (iso?: string) =>
  iso && moment(iso, "YYYY-MM-DD", true).isValid()
    ? moment(iso, "YYYY-MM-DD").format("DD.MM.YYYY ddd")
    : "—";

function InlineDate({
  value,
  onCommit,
  label,
}: {
  value?: string;
  onCommit: (iso: string) => void;
  label?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      try {
        (inputRef.current as any).showPicker?.();
      } catch {}
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing]);

  return (
    <Box
      sx={{ cursor: "pointer", width: "100%", textAlign: "center" }}
      onClick={() => setEditing(true)}
      title="Изменить дату"
    >
      {!editing ? (
        <Typography component="span" sx={{ display: "block", lineHeight: 1.2 }}>
          {ru(value)}
        </Typography>
      ) : (
        <TextField
          inputRef={inputRef}
          size="small"
          type="date"
          value={value || ""}
          onChange={(e) => onCommit(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          InputLabelProps={{ shrink: true }}
          inputProps={{ "aria-label": label }}
          sx={{
            width: "100%",
            "& .MuiOutlinedInput-notchedOutline": { display: "none" },
            "& .MuiInputBase-input": { p: 0, textAlign: "center" },
            bgcolor: "transparent",
          }}
        />
      )}
    </Box>
  );
}

export default function ReleasesPage() {
  const { data: releasesRaw = [] } = useGetReleasesQuery();
  const [addRelease, { isLoading: adding }] = useAddReleaseMutation();
  const [updateRelease] = useUpdateReleaseMutation();
  const [deleteRelease] = useDeleteReleaseMutation();

  const [hidePast, setHidePast] = React.useState(true);

  const todayISO = toISOlocal(new Date());
  const releases = React.useMemo(() => {
    let arr = releasesRaw.slice().sort((a, b) => {
      const aHas = !!a.promDate;
      const bHas = !!b.promDate;
      if (aHas && bHas) return a.promDate!.localeCompare(b.promDate!);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return 0;
    });
    if (hidePast) {
      arr = arr.filter((r) => !r.promDate || r.promDate >= todayISO);
    }
    return arr;
  }, [releasesRaw, hidePast, todayISO]);

  const [newProm, setNewProm] = React.useState<string>("");
  const onAdd = async () => {
    if (!newProm) return;
    await addRelease({ promDate: newProm }).unwrap();
    setNewProm("");
  };

  const onClear = async (r: Release) => {
    await updateRelease({ id: r.id, action: "clear" } as any).unwrap();
  };

  const onDelete = async (r: Release) => {
    if (!window.confirm("Удалить релиз?")) return;
    await deleteRelease({ id: r.id }).unwrap();
  };

  const commit = async (r: Release, field: ReleaseAnchorField, iso: string) => {
    if (!iso) return;
    await updateRelease({
      id: r.id,
      action: "recalc",
      anchorField: field,
      anchorDate: iso,
    }).unwrap();
  };

  const PROM_W = 180;
  const ACTION_W = 120;
  const stickyBg = "background.paper";

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems="center"
      >
        <Typography variant="h6" sx={{ flex: 1 }}>
          Релизы
        </Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={hidePast}
              onChange={(e) => setHidePast(e.target.checked)}
            />
          }
          label="Скрыть прошедшие"
        />

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            type="date"
            label="Дата ПРОМ"
            value={newProm}
            onChange={(e) => setNewProm(e.target.value)}
            InputLabelProps={{ shrink: true }}
            onClick={(e) => {
              const input = e.currentTarget.querySelector(
                "input"
              ) as HTMLInputElement;
              try {
                (input as any)?.showPicker?.();
              } catch {}
            }}
          />
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={onAdd}
            disabled={!newProm || adding}
          >
            Добавить релиз
          </Button>
        </Stack>
      </Stack>

      <TableContainer sx={{ overflowX: "auto", maxWidth: "100%" }}>
        <Table
          size="small"
          stickyHeader
          sx={{
            minWidth: 1600,
            tableLayout: "auto",
            "& th, & td": {
              whiteSpace: "nowrap",
              p: 1,
              verticalAlign: "middle",
              fontSize: "0.9rem",
              lineHeight: 1.2,
              textAlign: "center",
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 110 }}>СТ</TableCell>
              <TableCell sx={{ minWidth: 140 }}>Разработка (начало)</TableCell>
              <TableCell sx={{ minWidth: 140 }}>
                Разработка (окончание)
              </TableCell>
              <TableCell sx={{ minWidth: 110 }}>CR</TableCell>
              <TableCell sx={{ minWidth: 110 }}>Сборка</TableCell>
              <TableCell sx={{ minWidth: 140 }}>ИФТ (начало)</TableCell>
              <TableCell sx={{ minWidth: 140 }}>ИФТ (окончание)</TableCell>
              <TableCell sx={{ minWidth: 150 }}>FF InnerSource</TableCell>
              <TableCell sx={{ minWidth: 110 }}>FF</TableCell>
              <TableCell sx={{ minWidth: 150 }}>Регресс (начало)</TableCell>
              <TableCell sx={{ minWidth: 150 }}>Регресс (окончание)</TableCell>
              <TableCell sx={{ minWidth: 130 }}>OPS (начало)</TableCell>
              <TableCell sx={{ minWidth: 130 }}>OPS (окончание)</TableCell>
              <TableCell sx={{ minWidth: 120 }}>ПСИ</TableCell>

              <TableCell
                sx={{
                  minWidth: PROM_W,
                  width: PROM_W,
                  position: "sticky",
                  right: ACTION_W,
                  zIndex: 3,
                  bgcolor: stickyBg,
                  fontWeight: 700,
                  boxShadow: "-4px 0 6px -4px rgba(0,0,0,0.12)",
                }}
              >
                ПРОМ
              </TableCell>

              <TableCell
                align="right"
                sx={{
                  minWidth: ACTION_W,
                  width: ACTION_W,
                  position: "sticky",
                  right: 0,
                  zIndex: 4,
                  bgcolor: stickyBg,
                  fontWeight: 700,
                  boxShadow: "-4px 0 6px -4px rgba(0,0,0,0.12)",
                }}
              >
                Действия
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {releases.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <InlineDate
                    value={r.stDate}
                    onCommit={(iso) => commit(r, "stDate", iso)}
                    label="СТ"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.devStart}
                    onCommit={(iso) => commit(r, "devStart", iso)}
                    label="Разработка начало"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.devEnd}
                    onCommit={(iso) => commit(r, "devEnd", iso)}
                    label="Разработка конец"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.crDate}
                    onCommit={(iso) => commit(r, "crDate", iso)}
                    label="CR"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.buildDate}
                    onCommit={(iso) => commit(r, "buildDate", iso)}
                    label="Сборка"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.iftStart}
                    onCommit={(iso) => commit(r, "iftStart", iso)}
                    label="ИФТ начало"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.iftEnd}
                    onCommit={(iso) => commit(r, "iftEnd", iso)}
                    label="ИФТ конец"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.ffInnerDate}
                    onCommit={(iso) => commit(r, "ffInnerDate", iso)}
                    label="FF InnerSource"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.ffDate}
                    onCommit={(iso) => commit(r, "ffDate", iso)}
                    label="FF"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.regressStart}
                    onCommit={(iso) => commit(r, "regressStart", iso)}
                    label="Регресс начало"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.regressEnd}
                    onCommit={(iso) => commit(r, "regressEnd", iso)}
                    label="Регресс конец"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.opsStart}
                    onCommit={(iso) => commit(r, "opsStart", iso)}
                    label="OPS начало"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.opsEnd}
                    onCommit={(iso) => commit(r, "opsEnd", iso)}
                    label="OPS конец"
                  />
                </TableCell>
                <TableCell>
                  <InlineDate
                    value={r.psiDate}
                    onCommit={(iso) => commit(r, "psiDate", iso)}
                    label="ПСИ"
                  />
                </TableCell>

                <TableCell
                  sx={{
                    position: "sticky",
                    right: ACTION_W,
                    zIndex: 2,
                    bgcolor: stickyBg,
                    minWidth: PROM_W,
                    width: PROM_W,
                    fontWeight: 700,
                  }}
                >
                  <InlineDate
                    value={r.promDate}
                    onCommit={(iso) => commit(r, "promDate", iso)}
                    label="ПРОМ"
                  />
                </TableCell>

                <TableCell
                  align="right"
                  sx={{
                    position: "sticky",
                    right: 0,
                    zIndex: 3,
                    bgcolor: stickyBg,
                    minWidth: ACTION_W,
                    width: ACTION_W,
                  }}
                >
                  <Tooltip title="Стереть все поля (кроме ПРОМ)">
                    <IconButton onClick={() => onClear(r)} size="small">
                      <Backspace />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Удалить релиз">
                    <IconButton onClick={() => onDelete(r)} size="small">
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}

            {!releases.length && (
              <TableRow>
                <TableCell
                  colSpan={16}
                  align="center"
                  sx={{ py: 6, color: "text.secondary" }}
                >
                  Релизов нет под текущий фильтр. Добавьте новый по дате ПРОМ.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
