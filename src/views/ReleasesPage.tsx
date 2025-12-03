// src/views/ReleasesPage.tsx
import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Button,
  IconButton,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Tooltip,
  Checkbox,
  FormControlLabel,
  TableContainer,
} from "@mui/material";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterMoment } from "@mui/x-date-pickers/AdapterMoment";
import { ruRU } from "@mui/x-date-pickers/locales";
import { Add, Delete, Backspace } from "@mui/icons-material";
import moment from "moment";
import "moment/locale/ru";

import {
  useGetReleasesQuery,
  useAddReleaseMutation,
  useUpdateReleaseMutation,
  useDeleteReleaseMutation,
} from "../app/api";
import type { Release } from "../types";

moment.locale("ru");

function isBusinessDay(d: Date) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toISOlocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fromISOlocal(iso: string) {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, dd || 1);
}
function addBusinessDaysISO(iso: string, delta: number) {
  let d = fromISOlocal(iso);
  if (delta === 0) return iso;
  const step = delta > 0 ? 1 : -1;
  let left = Math.abs(delta);
  while (left > 0) {
    d.setDate(d.getDate() + step);
    if (isBusinessDay(d)) left -= 1;
  }
  return toISOlocal(d);
}
const fmt = "YYYY-MM-DD";
const parseISODate = (iso?: string | null) => (iso ? moment(iso, fmt, true) : null);
const isoFromMoment = (d: moment.Moment) => d.format(fmt);
const desktopPickerMedia = "(min-width: 0px)";
type K =
  | "stDate"
  | "devStart"
  | "devEnd"
  | "crDate"
  | "buildDate"
  | "iftStart"
  | "iftEnd"
  | "ffInnerDate"
  | "ffDevToolsDate"
  | "ffDate"
  | "regressStart"
  | "regressEnd"
  | "opsStart"
  | "opsEnd"
  | "psiDate"
  | "promDate";

function recalcPrevious(current: Release, anchor: K, iso: string): Release {
  const out: Release = { ...current, [anchor]: iso };

  const fromDevStart = (devStart: string) => {
    const stDate = addBusinessDaysISO(devStart, -1);
    out.devStart = devStart;
    out.stDate = stDate;
  };

  const fromDevEnd = (devEnd: string) => {
    const devStart = addBusinessDaysISO(devEnd, -6);
    out.devEnd = devEnd;
    fromDevStart(devStart);
  };

  const fromCR = (crDate: string) => {
    const devStart = addBusinessDaysISO(crDate, -7);
    const devEnd = addBusinessDaysISO(devStart, +6);
    out.crDate = crDate;
    out.devStart = devStart;
    out.devEnd = devEnd;
    fromDevStart(devStart);
  };

  const fromBuild = (buildDate: string) => {
    const crDate = addBusinessDaysISO(buildDate, -1);
    out.buildDate = buildDate;
    fromCR(crDate);
  };

  const fromIftStart = (iftStart: string) => {
    const iftEnd = addBusinessDaysISO(iftStart, +4);
    out.iftStart = iftStart;
    out.iftEnd = iftEnd;
    const buildDate = addBusinessDaysISO(iftStart, -1);
    fromBuild(buildDate);
  };

  const fromFFInner = (ffInnerDate: string) => {
    const iftStart = addBusinessDaysISO(ffInnerDate, -5);
    out.ffInnerDate = ffInnerDate;
    fromIftStart(iftStart);
  };

  const fromFFDevTools = (ffDevToolsDate: string) => {
    const ffInnerDate = addBusinessDaysISO(ffDevToolsDate, -1);
    const ffDate = addBusinessDaysISO(ffDevToolsDate, +2);
    out.ffDevToolsDate = ffDevToolsDate;
    out.ffDate = ffDate;
    fromFFInner(ffInnerDate);
  };

  const fromFF = (ffDate: string) => {
    const ffDevToolsDate = addBusinessDaysISO(ffDate, -2);
    out.ffDate = ffDate;
    fromFFDevTools(ffDevToolsDate);
  };

  const fromRegressStart = (regressStart: string) => {
    const regressEnd = addBusinessDaysISO(regressStart, +3);
    out.regressStart = regressStart;
    out.regressEnd = regressEnd;
    const ffDate = addBusinessDaysISO(regressStart, -1);
    fromFF(ffDate);
  };

  const fromRegressEnd = (regressEnd: string) => {
    const regressStart = addBusinessDaysISO(regressEnd, -3);
    out.regressEnd = regressEnd;
    fromRegressStart(regressStart);
  };

  const fromOpsStart = (opsStart: string) => {
    const regressEnd = addBusinessDaysISO(opsStart, -1);
    out.opsStart = opsStart;
    out.opsEnd = addBusinessDaysISO(opsStart, +2);
    fromRegressEnd(regressEnd);
  };

  const fromOpsEnd = (opsEnd: string) => {
    const opsStart = addBusinessDaysISO(opsEnd, -2);
    out.opsEnd = opsEnd;
    fromOpsStart(opsStart);
  };

  const fromPSI = (psiDate: string) => {
    const opsEnd = addBusinessDaysISO(psiDate, -1);
    out.psiDate = psiDate;
    fromOpsEnd(opsEnd);
  };

  const fromProm = (promDate: string) => {
    const psiDate = addBusinessDaysISO(promDate, -1);
    out.promDate = promDate;
    fromPSI(psiDate);
  };

  switch (anchor) {
    case "promDate": {
      fromProm(iso);
      break;
    }
    case "psiDate": {
      fromPSI(iso);
      break;
    }
    case "opsEnd": {
      fromOpsEnd(iso);
      break;
    }
    case "opsStart":
      fromOpsStart(iso);
      break;

    case "regressEnd": {
      fromRegressEnd(iso);
      break;
    }
    case "regressStart":
      fromRegressStart(iso);
      break;

    case "ffDate":
      fromFF(iso);
      break;

    case "ffDevToolsDate":
      fromFFDevTools(iso);
      break;

    case "ffInnerDate":
      fromFFInner(iso);
      break;

    case "iftEnd": {
      const iftStart = addBusinessDaysISO(iso, -4);
      out.iftEnd = iso;
      fromIftStart(iftStart);
      break;
    }
    case "iftStart":
      fromIftStart(iso);
      break;

    case "buildDate":
      fromBuild(iso);
      break;

    case "crDate":
      fromCR(iso);
      break;

    case "devEnd":
      fromDevEnd(iso);
      break;

    case "devStart":
      fromDevStart(iso);
      out.devEnd = addBusinessDaysISO(iso, +6);
      break;

    case "stDate":
      out.stDate = iso;
      break;
  }

  return out;
}

const isReleaseCleared = (r: Release) =>
  !r.psiDate &&
  !r.opsStart &&
  !r.opsEnd &&
  !r.regressStart &&
  !r.regressEnd &&
  !r.ffDate &&
  !r.ffDevToolsDate &&
  !r.ffInnerDate &&
  !r.iftStart &&
  !r.iftEnd &&
  !r.buildDate &&
  !r.crDate &&
  !r.devStart &&
  !r.devEnd &&
  !r.stDate;

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
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  const parsed = parseISODate(value);
  const display = parsed
    ? `${parsed.format("DD.MM.YYYY")} (${parsed.format("dd")})`
    : "—";

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next && wrapperRef.current?.contains(next as Node)) {
      return;
    }
    setEditing(false);
    setPickerOpen(false);
  };

  React.useEffect(() => {
    if (editing) {
      setPickerOpen(true);
    } else {
      setPickerOpen(false);
    }
  }, [editing]);

  return (
    <div ref={wrapperRef} onBlur={handleBlur}>
      {editing ? (
        <DatePicker
          open={pickerOpen}
          onOpen={() => setPickerOpen(true)}
          onClose={() => setPickerOpen(false)}
          onAccept={() => setEditing(false)}
          value={parsed}
          onChange={(newValue, context) => {
            if (context?.validationError) return;
            if (!newValue) {
              onCommit("");
              return;
            }
            onCommit(isoFromMoment(newValue));
          }}
          format="DD.MM.YYYY"
          desktopModeMediaQuery={desktopPickerMedia}
          slotProps={{
            textField: {
              size: "small",
              fullWidth: true,
              InputLabelProps: { shrink: true },
              inputProps: { "aria-label": label },
              autoFocus: true,
              sx: {
                maxWidth: 132,
                minWidth: 120,
                mx: "auto",
                textAlign: "center",
                "& .MuiOutlinedInput-notchedOutline": { display: "none" },
                "& .MuiInputBase-input": { p: 0.4, textAlign: "center", fontSize: "0.9rem" },
                "& .MuiInputBase-root": { pr: 0.25, height: 34 },
                bgcolor: "transparent",
              },
            },
            openPickerButton: {
              size: "small",
              sx: { fontSize: "1rem", pr: 0.25 },
            },
            actionBar: { actions: ["clear"] as const },
          }}
          enableAccessibleFieldDOMStructure={false}
        />
      ) : (
        <Button
          variant="text"
          color="inherit"
          onClick={() => setEditing(true)}
          fullWidth
          sx={{
            minWidth: 110,
            maxWidth: 140,
            px: 0.5,
            py: 0.5,
            mx: "auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 1,
            textTransform: "none",
            fontSize: "0.9rem",
            lineHeight: 1.2,
            color: "text.primary",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          {display}
        </Button>
      )}
    </div>
  );
}

export default function ReleasesPage() {
  const { data: releasesRaw = [] } = useGetReleasesQuery();
  const [addRelease, { isLoading: adding }] = useAddReleaseMutation();
  const [updateRelease] = useUpdateReleaseMutation();
  const [deleteRelease] = useDeleteReleaseMutation();

  const [hidePast, setHidePast] = React.useState(true);
  const [manualReleaseIds, setManualReleaseIds] = React.useState<Set<string>>(
    () => new Set()
  );

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

  React.useEffect(() => {
    setManualReleaseIds((prev) => {
      const next = new Set(prev);
      releasesRaw.forEach((r) => {
        if (isReleaseCleared(r)) {
          next.add(r.id);
        }
      });
      return next;
    });
  }, [releasesRaw]);

  const [newProm, setNewProm] = React.useState<string>("");
  const onAdd = async () => {
    if (!newProm) return;
    const auto = recalcPrevious({} as Release, "promDate", newProm);
    const { id: _omit, createdAt, updatedAt, ...payload } = auto as Partial<Release>;
    await addRelease(payload as Partial<Release> & { promDate: string }).unwrap();
    setNewProm("");
  };

  const onClear = async (r: Release) => {
    await updateRelease({ id: r.id, action: "clear" } as any).unwrap();
    setManualReleaseIds((prev) => {
      const next = new Set(prev);
      next.add(r.id);
      return next;
    });
  };

  const onDelete = async (r: Release) => {
    if (!window.confirm("Удалить релиз?")) return;
    await deleteRelease({ id: r.id }).unwrap();
  };

  const commit = async (r: Release, field: K, iso: string) => {
    if (!iso) return;
    const manual = manualReleaseIds.has(r.id) || isReleaseCleared(r);
    if (manual) {
      await updateRelease({ id: r.id, [field]: iso } as any).unwrap();
      setManualReleaseIds((prev) => {
        const next = new Set(prev);
        next.add(r.id);
        return next;
      });
      return;
    }

    const updated = recalcPrevious(r, field, iso);
    const { id: _omit, ...patch } = updated as Release & { id: string };
    await updateRelease({ id: r.id, ...patch }).unwrap();
  };

  const PROM_W = 180;
  const ACTION_W = 120;
  const stickyBg = "background.paper";

  return (
    <LocalizationProvider
      dateAdapter={AdapterMoment}
      adapterLocale="ru"
      localeText={ruRU.components.MuiLocalizationProvider.defaultProps.localeText}
    >
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
          <DatePicker
            label="Дата ПРОМ"
            value={parseISODate(newProm)}
            onChange={(newValue, context) => {
              if (context?.validationError) return;
              setNewProm(newValue && newValue.isValid() ? isoFromMoment(newValue) : "");
            }}
            format="DD.MM.YYYY"
            desktopModeMediaQuery={desktopPickerMedia}
            slotProps={{
              textField: {
                size: "small",
                InputLabelProps: { shrink: true },
                sx: {
                  width: 170,
                  "& .MuiInputBase-input": { fontSize: "0.95rem" },
                  "& .MuiInputBase-root": { height: 36 },
                },
              },
              openPickerButton: {
                size: "small",
                sx: { fontSize: "1rem", pr: 0.25 },
              },
              actionBar: { actions: ["clear"] as const },
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
                Разработка (конец)
              </TableCell>
              <TableCell sx={{ minWidth: 110 }}>CR</TableCell>
              <TableCell sx={{ minWidth: 110 }}>Сборка</TableCell>
              <TableCell sx={{ minWidth: 140 }}>ИФТ (начало)</TableCell>
              <TableCell sx={{ minWidth: 140 }}>ИФТ (конец)</TableCell>
              <TableCell sx={{ minWidth: 150 }}>FF InnerSource</TableCell>
              <TableCell sx={{ minWidth: 140 }}>FF DevTools</TableCell>
              <TableCell sx={{ minWidth: 110 }}>FF</TableCell>
              <TableCell sx={{ minWidth: 150 }}>Регресс (начало)</TableCell>
              <TableCell sx={{ minWidth: 150 }}>Регресс (конец)</TableCell>
              <TableCell sx={{ minWidth: 130 }}>OPS (начало)</TableCell>
              <TableCell sx={{ minWidth: 130 }}>OPS (конец)</TableCell>
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
                    value={r.ffDevToolsDate}
                    onCommit={(iso) => commit(r, "ffDevToolsDate", iso)}
                    label="FF DevTools"
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
    </LocalizationProvider>
  );
}
